import { beforeEach,expect,it,vi } from 'vitest';
import type { Group, State } from '../../src/core/types';
type Callback=(...args:any[])=>any;
let connect:Callback;
let message:Callback;
let disconnect:Callback;
let latest:State;
let stored:State|undefined;
let groups:Group[];
let url:string;
let confirmations:number;
let failVerify:boolean;
let closed:boolean;
const item={key:'item',title:'Synthetic coffee',quantity:'1 unit every 2 weeks',savings:'Saving 5%'};
function event(set:(fn:Callback)=>void){return{addListener:set};}
beforeEach(async()=>{
  vi.resetModules();confirmations=0;failVerify=false;closed=false;stored=undefined;url='';
  groups=[{key:'a',destinationKey:'a'.repeat(64),arrival:{start:'2026-10-30',end:'2026-10-30'},items:[item],manageUrl:'https://www.amazon.com/auto-deliveries/?deliveryBundleId=a',editable:true,observedAt:''}];
  vi.stubGlobal('chrome',{
    runtime:{id:'ext',getURL:(p:string)=>`chrome-extension://ext/${p}`,onInstalled:event(()=>{}),onConnect:event(fn=>{connect=fn;})},
    sidePanel:{setPanelBehavior:vi.fn()},
    storage:{local:{get:async()=>({state:stored}),set:async(value:{state:State})=>{stored=structuredClone(value.state);}}},
    tabs:{create:async(options:{url:string})=>{url=options.url;return{id:1};},update:async(_id:number,options:{url:string})=>{url=options.url;},get:async()=>({url,status:'complete'}),onRemoved:event(()=>{}),sendMessage:async(_id:number,m:any)=>{
      const key=new URL(url).searchParams.get('deliveryBundleId');const group=groups.find(g=>g.key===key);
      switch(m.command){
        case 'hub':return{ok:true,value:{cards:groups.map(g=>({key:g.key,manageUrl:g.manageUrl,arrival:g.arrival.start})),next:false}};
        case 'detail':return{ok:true,value:structuredClone(group)};
        case 'calendar':return{ok:true,value:{dates:['2026-11-03'],months:['November 2026']}};
        case 'select':return{ok:true,value:'one-use-token'};
        case 'confirm':confirmations++;if(!failVerify)group!.arrival={start:'2026-11-03',end:'2026-11-03'};return{ok:true,value:true};
        default:throw new Error('Unexpected adapter command');
      }
    }}
  });
  await import('../../src/background');
  connect({name:'away-mode-panel',sender:{id:'ext',url:'chrome-extension://ext/panel/index.html'},postMessage:(m:any)=>{latest=structuredClone(m.state);},disconnect:()=>{closed=true;},onMessage:event(fn=>{message=fn;}),onDisconnect:event(fn=>{disconnect=fn;})});
  await settle();
});
async function settle(){for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,2));if(latest&&!latest.busy)return;}throw new Error('Panel did not settle');}
async function send(m:any){message(m);await new Promise(r=>setTimeout(r,2));await settle();}
async function review(){await send({type:'settings',settings:{schemaVersion:1,windows:[{id:'trip',start:'2026-10-29',end:'2026-11-02'}],destination:'a'.repeat(64),horizonDays:90}});await send({type:'scan'});await send({type:'plan'});}
it('scans, freezes review, verifies and consumes the plan',async()=>{await review();expect(latest.plan?.[0].target).toBe('2026-11-03');message({type:'apply'});await new Promise(r=>setTimeout(r,900));await settle();expect(confirmations).toBe(1);expect(latest.run?.entries[0].status).toBe('verified');expect(latest.plan).toBeUndefined();await send({type:'apply'});expect(confirmations).toBe(1);});
it('rejects simultaneous Apply messages without duplicate confirmations',async()=>{await review();message({type:'apply'});message({type:'apply'});await new Promise(r=>setTimeout(r,900));await settle();expect(confirmations).toBe(1);});
it('blocks new plans after an unverified write and reconciles unchanged state',async()=>{await review();failVerify=true;message({type:'apply'});await new Promise(r=>setTimeout(r,900));await settle();expect(latest.run?.entries[0].status).toBe('unknown');await send({type:'plan'});expect(latest.error).toMatch(/Reconcile/);await send({type:'reconcile'});expect(latest.run?.entries[0].status).toBe('blocked');expect(confirmations).toBe(1);});
it('invalidates the reviewed plan when away dates change',async()=>{await review();await send({type:'settings',settings:{...latest.settings,windows:[]}});await send({type:'apply'});expect(confirmations).toBe(0);});
it('rejects ports opened from website content',()=>{connect({name:'away-mode-panel',sender:{id:'ext',url:'https://www.amazon.com/auto-deliveries',tab:{id:1}},disconnect:()=>{closed=true;}});expect(closed).toBe(true);});
