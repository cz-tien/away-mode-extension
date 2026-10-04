import { button, calendarDates, calendarDialog, detail, hubCards, hubNext, pageSignature, text, visible } from '../adapters/amazon/dom';
import { fingerprint } from '../core/planner';
import { validDate } from '../core/dates';
let prepared: {token:string;target:string;fingerprint:string}|undefined;
let inFlight=false;
async function wait<T>(read:()=>T|undefined, timeout=12000): Promise<T> {
  const end=Date.now()+timeout;
  while(Date.now()<end) { const value=read(); if(value!==undefined) return value; await new Promise(r=>setTimeout(r,150)); }
  throw new Error('Amazon did not finish updating; stop and check the page');
}
function guard():void {
  if(location.origin!=='https://www.amazon.com'||!/^\/auto-deliveries\/?$/.test(location.pathname)) throw new Error('Unsupported Amazon page');
  if(document.querySelector('#captchacharacters') || /\/ap\/signin/.test(location.pathname)) throw new Error('Sign in or complete Amazon verification yourself');
}
async function openCalendar():Promise<HTMLElement> {
  try { return calendarDialog(document); } catch { button(document,'Reschedule').click(); }
  return wait(()=>{try{return calendarDialog(document);}catch{return undefined;}});
}
async function inspect(limit:string):Promise<{dates:string[];months:string[]}> {
  if(!validDate(limit)) throw new Error('Invalid calendar horizon');
  const root=await openCalendar(); const dates=new Set<string>(); const months:string[]=[];
  // Start at the earliest month Amazon exposes, so before-departure choices
  // include dates preceding the original delivery month.
  for(let i=0;i<18;i++) {
    const previous=root.querySelector<HTMLElement>('.a-cal-paginate-prev');
    if(!previous||!visible(previous)||previous.getAttribute('aria-disabled')==='true')break;
    const heading=text(root.querySelector('.a-cal-month-header'));
    previous.click();await wait(()=>text(root.querySelector('.a-cal-month-header'))!==heading?true:undefined);
  }
  for(let i=0;i<18;i++) {
    const heading=text(root.querySelector('.a-cal-month-header'));
    if(!heading||months.includes(heading)) throw new Error('Calendar month did not advance');
    months.push(heading);
    for(const date of calendarDates(root)) if(date<=limit) dates.add(date);
    const cells=Array.from(root.querySelectorAll<HTMLElement>('td[data-timestamp-utc]')).map(td=>new Date(Number(td.dataset.timestampUtc)).toISOString().slice(0,10)).sort();
    if(cells.at(-1)!>=limit) break;
    const next=root.querySelector<HTMLElement>('.a-cal-paginate-next');
    if(!next||!visible(next)||next.getAttribute('aria-disabled')==='true') break;
    next.click(); await wait(()=>text(root.querySelector('.a-cal-month-header'))!==heading?true:undefined);
  }
  button(root,'Close').click();
  return {dates:[...dates].sort(),months};
}
async function select(target:string, expected:string):Promise<string> {
  if(!validDate(target)||fingerprint(await detail(document,location.href))!==expected) throw new Error('Group changed before date selection');
  const root=await openCalendar();
  for(let i=0;i<18;i++) {
    const enabled=calendarDates(root);
    if(enabled.includes(target)) {
      const cell=Array.from(root.querySelectorAll<HTMLElement>('td[data-timestamp-utc]')).find(td=>new Date(Number(td.dataset.timestampUtc)).toISOString().slice(0,10)===target)!;
      cell.querySelector<HTMLElement>('a.a-cal-date-anchor')!.click();
      await wait(()=>cell.classList.contains('a-cal-select')?true:undefined);
      const token=crypto.randomUUID(); prepared={token,target,fingerprint:expected}; return token;
    }
    const heading=text(root.querySelector('.a-cal-month-header'));
    const all=Array.from(root.querySelectorAll<HTMLElement>('td[data-timestamp-utc]')).map(td=>new Date(Number(td.dataset.timestampUtc)).toISOString().slice(0,10)).sort();
    const direction=all[0] && target<all[0] ? 'prev':'next';
    const nav=root.querySelector<HTMLElement>(`.a-cal-paginate-${direction}`);
    if(!nav||!visible(nav)) break;
    nav.click(); await wait(()=>text(root.querySelector('.a-cal-month-header'))!==heading?true:undefined);
  }
  throw new Error('Reviewed target is no longer enabled');
}
async function command(m:Record<string,unknown>):Promise<unknown> {
  guard();
  switch(m.command) {
    case 'hub': { const cards=hubCards(document); return {cards,next:!!hubNext(document)}; }
    case 'next': { const before=pageSignature(document); const next=hubNext(document); if(!next) throw new Error('No next page'); next.click(); await wait(()=>pageSignature(document)!==before?true:undefined); return true; }
    case 'detail': return detail(document,location.href);
    case 'calendar': return inspect(String(m.limit));
    case 'select': return select(String(m.target),String(m.fingerprint));
    case 'confirm': {
      if(!prepared||m.token!==prepared.token) throw new Error('No reviewed date selection');
      const p=prepared; prepared=undefined; // one-use capability, consumed before any click
      if(fingerprint(await detail(document,location.href))!==p.fingerprint) throw new Error('Group changed before confirmation');
      const root=calendarDialog(document);
      const selected=root.querySelector<HTMLElement>('td.a-cal-select[data-timestamp-utc]');
      if(!selected||new Date(Number(selected.dataset.timestampUtc)).toISOString().slice(0,10)!==p.target) throw new Error('Selected date changed');
      button(root,'Confirm').click();
      return true;
    }
    default: throw new Error('Unknown extension command');
  }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) || sender.tab || message?.channel!=='away-mode-adapter') return;
  if(inFlight) {respond({ok:false,error:'Amazon operation already in progress'});return;}
  inFlight=true;
  command(message).then(value=>respond({ok:true,value}),e=>respond({ok:false,error:e instanceof Error?e.message:'Adapter failed'})).finally(()=>{inFlight=false;});
  return true;
});
