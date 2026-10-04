import type { Entry, State } from '../core/types';
import { defaults, validateSettings } from '../storage';
let state:State={settings:structuredClone(defaults)};
let editingId:string|undefined;
const port=chrome.runtime.connect({name:'away-mode-panel'});
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
function send(type:string,args:Record<string,unknown>={}):void {port.postMessage({type,...args});}
function node<K extends keyof HTMLElementTagNameMap>(tag:K,value?:string):HTMLElementTagNameMap[K] {const e=document.createElement(tag);if(value)e.textContent=value;return e;}
function settings():void {send('settings',{settings:state.settings});}
function renderEntry(entry:Entry,review:boolean):HTMLElement {
  const card=node('article');card.className='entry';card.append(node('h3',`${entry.group.arrival.start} → ${entry.target??'Needs attention'}`));
  const badge=node('p',({ready:'Ready',blocked:'Needs attention',applying:'Applying',verifying:'Verifying',verified:'Moved and verified',failed:'Needs attention',unknown:'Outcome unknown'} as const)[entry.status]);badge.className='badge';card.append(badge);
  if(entry.reason)card.append(node('p',entry.reason));
  card.append(node('p',`${entry.group.items.length} items move together${entry.group.editDeadline?` · Edit through ${entry.group.editDeadline}`:''}`));
  const list=node('ul');for(const item of entry.group.items)list.append(node('li',`${item.title} · ${item.quantity}${item.savings?' · '+item.savings:''}`));card.append(list);
  const link=node('a','View on Amazon');link.href=entry.group.manageUrl;link.target='_blank';link.rel='noreferrer';card.append(link);
  if(review){
    const label=node('label');const check=node('input');check.type='checkbox';check.checked=entry.selected;check.disabled=!!state.busy||entry.status!=='ready';check.onchange=()=>send('entry',{id:entry.id,selected:check.checked});label.append(check,node('span','Include this group'));card.append(label);
    const preference=node('select');for(const [value,title] of [['after','After return'],['before','Before departure']]){const option=node('option',title);option.value=value;preference.append(option);}preference.value=entry.preference;preference.disabled=!!state.busy;preference.onchange=()=>send('entry',{id:entry.id,preference:preference.value});card.append(preference);
  }
  return card;
}
function render():void {
  el('windows').replaceChildren();
  for(const w of state.settings.windows){const row=node('div');row.className='window';row.append(node('span',`${w.start} – ${w.end}`));const edit=node('button','Edit');edit.disabled=!!state.busy;edit.onclick=()=>{editingId=w.id;el<HTMLInputElement>('start').value=w.start;el<HTMLInputElement>('end').value=w.end;el('add').querySelector('button')!.textContent='Save dates';};const remove=node('button','Remove');remove.disabled=!!state.busy;remove.onclick=()=>{state.settings.windows=state.settings.windows.filter(x=>x.id!==w.id);settings();};row.append(edit,remove);el('windows').append(row);}
  const destinations=[...new Set(state.scan?.groups.map(g=>g.destinationKey)??[])];
  const select=el<HTMLSelectElement>('destination');select.replaceChildren(node('option','Choose a destination'));select.options[0].value='';
  destinations.forEach((d,i)=>{const option=node('option',`Destination ${i+1} · ${d.slice(0,8)}`);option.value=d;select.append(option);});select.value=state.settings.destination;
  const coverage=state.scan?.coverage;
  el('coverage').replaceChildren();
  if(coverage){el('coverage').append(node('p',`${coverage.complete?'Complete exposed list':'Incomplete scan'} · ${state.scan!.groups.length} groups · ${coverage.pages} pages · ${new Date(coverage.observedAt).toLocaleString()}`));el('coverage').append(node('p',`Dates checked: ${coverage.dates.join(', ')||'none'}. Ordinary orders not checked.`));for(const issue of coverage.issues)el('coverage').append(node('p',issue));}
  el('plan-list').replaceChildren(...(state.plan??[]).map(e=>renderEntry(e,true)));
  if(state.plan?.length===0)el('plan-list').append(node('p','No conflicts found in the deliveries checked. Arrival estimates can change.'));
  el('results').replaceChildren(...(state.run?.entries??[]).map(e=>renderEntry(e,false)));
  const unknown=state.run?.entries.some(e=>e.status==='unknown');
  for(const id of ['scan','plan','apply','clear','reconcile'])el<HTMLButtonElement>(id).disabled=!!state.busy;
  el<HTMLButtonElement>('plan').disabled=!!state.busy||!coverage?.complete||!state.settings.destination||!state.settings.windows.length||!!unknown;
  el<HTMLButtonElement>('apply').disabled=!!state.busy||!!unknown||!state.plan?.some(e=>e.selected&&e.status==='ready');
  el<HTMLButtonElement>('stop').disabled=!state.run?.active;
  select.disabled=!!state.busy;
  for(const input of el('add').querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button'))input.disabled=!!state.busy;
  el<HTMLInputElement>('import').disabled=!!state.busy;
  el('status').textContent=state.busy?`${state.busy==='apply'?'Applying reviewed changes':state.busy==='scan'?'Checking Amazon deliveries':state.busy==='plan'?'Inspecting available dates':'Working'}… Keep this panel open.`:'Ready. Changes happen only when you click Apply all.';
  el('error').textContent=state.error??'';
}
port.onMessage.addListener(message=>{if(message.type==='state'){state=message.state;render();}});
port.onDisconnect.addListener(()=>{el('error').textContent='Extension disconnected. Reopen the panel; interrupted results must be reconciled.';for(const b of document.querySelectorAll('button,input,select'))(b as HTMLButtonElement).disabled=true;});
el('add').onsubmit=e=>{e.preventDefault();const start=el<HTMLInputElement>('start').value,end=el<HTMLInputElement>('end').value;try{const windows=editingId?state.settings.windows.map(w=>w.id===editingId?{...w,start,end}:w):[...state.settings.windows,{id:crypto.randomUUID(),start,end}];state.settings=validateSettings({...state.settings,windows});editingId=undefined;el('add').querySelector('button')!.textContent='Add dates';settings();}catch(e){el('error').textContent=(e as Error).message;}};
el<HTMLSelectElement>('destination').onchange=()=>{state.settings.destination=el<HTMLSelectElement>('destination').value;settings();};
for(const id of ['scan','plan','apply','stop','reconcile'])el(id).onclick=()=>send(id);
el('clear').onclick=()=>{if(confirm('Clear Away Mode settings and results from this device?'))send('clear');};
el('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state.settings,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='away-mode-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
el<HTMLInputElement>('import').onchange=async()=>{try{const file=el<HTMLInputElement>('import').files?.[0];if(!file)return;if(file.size>100000)throw new Error('Settings file is too large');const settings=validateSettings(JSON.parse(await file.text()));send('settings',{settings});}catch(e){el('error').textContent=(e as Error).message;}finally{el<HTMLInputElement>('import').value='';}};
send('get');
