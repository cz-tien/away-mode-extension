import { HUB, safeUrl } from './adapters/amazon/dom';
import { addDays, merged, overlaps } from './core/dates';
import { checkFresh, membership, planEntry } from './core/planner';
import { execute, interrupt } from './core/run-state';
import type { Entry, Group, Run, Scan, State } from './core/types';
import { defaults, load, save, validateSettings } from './storage';
let state:State;
let lock=false;
const panels=new Set<chrome.runtime.Port>();
const ready=load().then(async s=>{state=s;state.busy=undefined;if(state.run?.active) interrupt(state.run);await save(state);});
chrome.runtime.onInstalled.addListener(()=>{void chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});});
async function persist():Promise<void> { await save(state); for(const panel of panels) { try{panel.postMessage({type:'state',state});}catch{/* closed */} } }
function alive():boolean {return panels.size>0 && !state.run?.stopped;}
async function adapter<T>(command:string,args:Record<string,unknown>={}):Promise<T> {
  if(state.workingTab===undefined) throw new Error('Amazon working tab unavailable');
  const tab=await chrome.tabs.get(state.workingTab);
  if(!tab.url || !safeUrl(tab.url)) throw new Error('Working tab left the subscription manager');
  const response=await chrome.tabs.sendMessage(state.workingTab,{channel:'away-mode-adapter',command,...args});
  if(!response?.ok) throw new Error(response?.error??'Amazon adapter unavailable; reload the extension and page');
  return response.value as T;
}
async function navigate(url:string):Promise<void> {
  url=safeUrl(url);
  if(state.workingTab===undefined) {
    const tab=await chrome.tabs.create({url,active:true}); state.workingTab=tab.id; await persist();
  } else await chrome.tabs.update(state.workingTab,{url});
  const end=Date.now()+20000;
  let lastError:unknown;
  while(Date.now()<end) {
    const tab=await chrome.tabs.get(state.workingTab!);
    if(tab.status==='complete') {
      if(!tab.url || new URL(tab.url).origin!=='https://www.amazon.com'||!/^\/auto-deliveries\/?$/.test(new URL(tab.url).pathname)) throw new Error('Amazon requires sign-in or opened an unexpected page');
      try {await adapter(new URL(url).searchParams.has('deliveryBundleId')?'detail':'hub');return;} catch(e) {lastError=e;}
    }
    await new Promise(r=>setTimeout(r,200));
  }
  throw new Error(lastError instanceof Error?lastError.message:'Amazon page timed out');
}
async function collect():Promise<Scan> {
  const observedAt=new Date().toISOString(); const issues:string[]=[];
  const cards=new Map<string,{key:string;manageUrl:string;arrival:string}>();
  const seen=new Set<string>(); let pages=0,complete=false;
  await navigate(HUB);
  for(let i=0;i<50;i++) {
    const page=await adapter<{cards:{key:string;manageUrl:string;arrival:string}[];next:boolean}>('hub');
    pages++;
    const signature=page.cards.map(c=>c.key).join('|');
    if(!signature||seen.has(signature)) {issues.push('Upcoming delivery list was empty or repeated; coverage could not be established');break;}
    seen.add(signature);for(const card of page.cards) cards.set(card.key,card);
    if(!page.next){complete=true;break;}
    await adapter('next');
  }
  if(pages===50&&!complete)issues.push('Stopped at the 50-page scan limit');
  const groups:Group[]=[];
  for(const card of cards.values()) {
    try {await navigate(card.manageUrl);const group=await adapter<Group>('detail');if(group.key!==card.key||group.arrival.start!==card.arrival)throw new Error('Group changed during scan');groups.push(group);}
    catch(e){issues.push(`Group ${groups.length+1}: ${e instanceof Error?e.message:'Unable to read'}`);complete=false;}
  }
  return {groups,coverage:{observedAt,pages,dates:[...new Set([...cards.values()].map(c=>c.arrival))].sort(),complete,issues,ordinaryOrders:false}};
}
async function inspect(entry:Entry):Promise<{dates:string[];months:string[]}> {await navigate(entry.group.manageUrl);checkFresh(entry,await adapter<Group>('detail'));return adapter('calendar',{limit:entry.calendarLimit});}
async function makePlan():Promise<void> {
  if(!state.scan?.coverage.complete)throw new Error('Complete the subscription scan before creating an executable plan');
  if(!state.settings.destination||!state.settings.windows.length)throw new Error('Choose a destination and add away dates first');
  if(state.run?.entries.some(e=>e.status==='unknown'))throw new Error('Reconcile unknown results before creating another plan');
  const entries:Entry[]=[];
  const trips=merged(state.settings.windows);
  for(const group of state.scan.groups.filter(g=>g.destinationKey===state.settings.destination&&trips.some(w=>overlaps(g.arrival,w)))) {
    const entry=planEntry(group,state.settings.windows,[], 'after',state.settings.horizonDays);
    if(group.editable) {
      try{const calendar=await inspect(entry);entries.push(planEntry(group,state.settings.windows,calendar.dates,'after',state.settings.horizonDays));}
      catch(e){entry.reason=e instanceof Error?e.message:'Calendar unavailable';entries.push(entry);}
    }else entries.push(entry);
    state.plan=[...entries];await persist();
  }
  state.plan=entries;
}
async function apply():Promise<void> {
  if(!state.plan || !state.scan?.coverage.complete || state.run?.entries.some(e=>e.status==='unknown'))throw new Error('Review a complete fresh plan first');
  const entries=structuredClone(state.plan.filter(e=>e.selected&&e.status==='ready'));
  if(!entries.length)throw new Error('No eligible groups selected');
  for(const entry of entries)if(!entry.target||planEntry(entry.group,state.settings.windows,entry.enabledDates,entry.preference,state.settings.horizonDays).target!==entry.target)throw new Error('Settings changed; review again');
  const run:Run={id:crypto.randomUUID(),entries,windows:structuredClone(state.settings.windows),destination:state.settings.destination,stopped:false,active:true,startedAt:new Date().toISOString()};
  state.run=run; await persist();let token:string|undefined;
  await execute(run,{
    resolve:async entry=>{await navigate(entry.group.manageUrl);return adapter<Group>('detail');},
    prepare:async entry=>{
      const dates=await adapter<{dates:string[]}>('calendar',{limit:entry.calendarLimit});
      if(!entry.target||!dates.dates.includes(entry.target))throw new Error('Target date is no longer available');
      token=await adapter<string>('select',{target:entry.target,fingerprint:entry.fingerprint});
    },
    confirm:async()=>{if(!alive())throw new Error('Panel closed before confirmation');await adapter('confirm',{token});token=undefined;},
    verify:async entry=>{
      // Re-enumeration resolves changed bundle IDs and catches merged memberships.
      await new Promise(r=>setTimeout(r,700));
      const scan=await collect();state.scan=scan;
      if(!scan.coverage.complete)throw new Error('Post-change coverage is incomplete');
      const matches=scan.groups.filter(g=>membership(g)===membership(entry.group)&&g.arrival.start===entry.target&&g.arrival.end===entry.target);
      if(matches.length!==1)throw new Error('Could not verify exact reviewed membership at the target; check Amazon');
      return matches[0];
    }
  },persist,alive);
  // Every execution consumes its reviewed plan, including interrupted runs.
  state.plan=undefined;
}
async function reconcile():Promise<void> {
  const scan=await collect();state.scan=scan;
  if(!scan.coverage.complete)throw new Error('Reconciliation scan is incomplete');
  for(const entry of state.run?.entries??[])if(entry.status==='unknown') {
    const matches=scan.groups.filter(g=>membership(g)===membership(entry.group));
    if(matches.length!==1)continue;
    try{
      if(checkFresh(entry,matches[0])==='verified'){entry.status='verified';entry.reason='Verified after interruption';}
      else{entry.status='blocked';entry.reason='Verified unchanged; create and review a new plan to retry';}
    }catch{/* leave uncertain */}
  }
}
async function handle(message:Record<string,unknown>):Promise<void> {
  await ready;
  if(message.type==='stop'){if(state.run)state.run.stopped=true;await persist();return;}
  if(message.type==='get'){await persist();return;}
  if(lock)throw new Error('A run is already in progress');
  lock=true;state.error=undefined;state.busy=String(message.type);await persist();
  try {
    switch(message.type){
      case 'settings':state.settings=validateSettings(message.settings);state.plan=undefined;break;
      case 'clear':
        if(state.run?.entries.some(e=>e.status==='unknown'))throw new Error('Reconcile unknown outcomes before clearing data');
        state={settings:structuredClone(defaults)};break;
      case 'scan':state.plan=undefined;state.scan=await collect();break;
      case 'plan':await makePlan();break;
      case 'entry':{
        const entry=state.plan?.find(e=>e.id===message.id);if(!entry)throw new Error('Plan entry unavailable');
        if(message.preference==='after'||message.preference==='before')Object.assign(entry,planEntry(entry.group,state.settings.windows,entry.enabledDates,message.preference,state.settings.horizonDays));
        if(typeof message.selected==='boolean')entry.selected=message.selected&&entry.status==='ready';
        break;
      }
      case 'apply':await apply();break;
      case 'reconcile':await reconcile();break;
      default:throw new Error('Unknown panel action');
    }
  }finally{state.busy=undefined;lock=false;await persist();}
}
chrome.runtime.onConnect.addListener(port=>{
  if(port.name!=='away-mode-panel'||port.sender?.id!==chrome.runtime.id||port.sender?.url!==chrome.runtime.getURL('panel/index.html')||port.sender.tab){port.disconnect();return;}
  panels.add(port);
  port.onMessage.addListener(message=>{if(!message||typeof message.type!=='string')return;void handle(message).catch(async e=>{state.error=e instanceof Error?e.message:'Unexpected error';await persist();});});
  port.onDisconnect.addListener(()=>{panels.delete(port);if(!panels.size&&state?.run?.active){state.run.stopped=true;void persist();}});
  void ready.then(persist);
});
chrome.tabs.onRemoved.addListener(id=>{if(state?.workingTab===id){state.workingTab=undefined;if(state.run?.active)state.run.stopped=true;void persist();}});
