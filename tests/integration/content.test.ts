// @vitest-environment jsdom
import { beforeEach,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { detail } from '../../src/adapters/amazon/dom';
import { fingerprint } from '../../src/core/planner';
type Listener=(m:Record<string,unknown>,sender:Record<string,unknown>,respond:(r:unknown)=>void)=>unknown;
let listener:Listener;
let confirms:number;
const url='https://www.amazon.com/auto-deliveries/?deliveryBundleId=synthetic';
beforeEach(async()=>{
  vi.resetModules();confirms=0;
  document.body.innerHTML=readFileSync('tests/fixtures/amazon/group.html','utf8');
  vi.spyOn(Element.prototype,'getClientRects').mockImplementation(function(this:Element){return this.closest('[hidden]')?[] as unknown as DOMRectList:[{}] as unknown as DOMRectList;});
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('location',{origin:'https://www.amazon.com',pathname:'/auto-deliveries/',href:url});
  vi.stubGlobal('chrome',{runtime:{id:'test-extension',getURL:(p:string)=>'chrome-extension://test-extension/'+p,onMessage:{addListener:(fn:Listener)=>{listener=fn;}}}});
  const dialog=document.querySelector<HTMLElement>('[role=dialog]')!;
  dialog.querySelector('button[aria-label=Close]')!.addEventListener('click',()=>{dialog.hidden=true;});
  document.querySelector('button[aria-label=Reschedule]')!.addEventListener('click',()=>{dialog.hidden=false;});
  dialog.querySelector('a.a-cal-date-anchor')!.addEventListener('click',e=>{(e.currentTarget as HTMLElement).parentElement!.classList.add('a-cal-select');});
  dialog.querySelector('button:not([aria-label])')!.addEventListener('click',()=>{confirms++;dialog.hidden=true;});
  await import('../../src/content/amazon');
});
async function command(command:string,args:Record<string,unknown>={}):Promise<{ok:boolean;value:any;error?:string}>{const r=await new Promise<any>(resolve=>listener({channel:'away-mode-adapter',command,...args},{id:'test-extension',url:'chrome-extension://test-extension/background.js'},resolve));await Promise.resolve();await Promise.resolve();return r;}
it('inspects and selects an enabled date without submitting, then consumes confirmation once',async()=>{
  const expected=fingerprint(await detail(document,url));
  expect((await command('calendar',{limit:'2026-11-03'})).value.dates).toEqual(['2026-11-03']);
  const selected=await command('select',{target:'2026-11-03',fingerprint:expected});expect(selected.ok).toBe(true);expect(confirms).toBe(0);
  expect((await command('confirm',{token:selected.value})).ok).toBe(true);expect(confirms).toBe(1);
  expect((await command('confirm',{token:selected.value})).ok).toBe(false);expect(confirms).toBe(1);
});
it('blocks membership changes after date selection and never clicks Skip',async()=>{
  const expected=fingerprint(await detail(document,url));const selected=await command('select',{target:'2026-11-03',fingerprint:expected});
  document.querySelector('[data-testid=product-qty-frequency]')!.textContent='2 units every 2 weeks';
  expect((await command('confirm',{token:selected.value})).ok).toBe(false);expect(confirms).toBe(0);
});
it('rejects a target cell that lost its selected state',async()=>{
  const selected=await command('select',{target:'2026-11-03',fingerprint:fingerprint(await detail(document,url))});
  document.querySelector('td.a-cal-select')!.classList.remove('a-cal-select');
  expect((await command('confirm',{token:selected.value})).ok).toBe(false);expect(confirms).toBe(0);
});
it('ignores messages from web pages and other extensions',()=>{
  const reply=vi.fn();listener({channel:'away-mode-adapter',command:'confirm',token:'forged'},{id:'other',url:'https://www.amazon.com'},reply);expect(reply).not.toHaveBeenCalled();expect(confirms).toBe(0);
});
