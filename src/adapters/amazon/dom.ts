import { parseAmazonDate, validDate, today } from '../../core/dates';
import type { Group, Item } from '../../core/types';
export const HUB = 'https://www.amazon.com/auto-deliveries';
export function arrivalDate(raw:string,url:URL,reference=today()):string {
  if(/\b(?:to|between)\b|[–—]|\d\s*-\s*\w/.test(raw))throw new Error('Delivery date interval requires manual review');
  const epoch=Number(url.searchParams.get('deliveryDate'));
  const anchor=epoch>0&&Number.isFinite(epoch)?new Date(epoch).toISOString().slice(0,10):reference;
  let result=parseAmazonDate(raw,anchor);
  if(epoch>0) {
    if(Math.abs(Date.parse(result+'T00:00:00Z')-epoch)>86400000)throw new Error('Displayed date conflicts with the management link');
  }else if(result<reference&&!/20\d{2}/.test(raw)) {
    result=`${Number(reference.slice(0,4))+1}${result.slice(4)}`;
    if(!validDate(result))throw new Error('Ambiguous upcoming delivery year');
  }
  return result;
}
export function safeUrl(raw: string): string {
  const u = new URL(raw,HUB);
  if (u.origin!=='https://www.amazon.com' || !/^\/auto-deliveries\/?$/.test(u.pathname)) throw new Error('Unexpected Amazon management URL');
  return u.href;
}
export function visible(el: Element): boolean {
  return !el.closest('[hidden],[aria-hidden="true"]') && (el as HTMLElement).getClientRects().length>0;
}
export function text(el: Element | null): string { return el?.textContent?.trim().replace(/\s+/g,' ') ?? ''; }
export function button(root: ParentNode, label: string): HTMLElement {
  const matches = Array.from(root.querySelectorAll<HTMLElement>('button,a,input[type="submit"],input[type="button"]')).filter(el=>visible(el) && (el.getAttribute('aria-label')===label || text(el)===label || (el instanceof HTMLInputElement && el.value===label) || (el instanceof HTMLInputElement && text(el.closest('.a-button'))===label)));
  if (matches.length!==1) throw new Error(`Expected one ${label} control; Amazon UI may have changed`);
  if (matches[0].hasAttribute('disabled') || matches[0].getAttribute('aria-disabled')==='true') throw new Error(`${label} is unavailable`);
  return matches[0];
}
export function hubCards(doc: Document): {key:string;manageUrl:string;arrival:string}[] {
  const result: {key:string;manageUrl:string;arrival:string}[]=[];
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a')).filter(a=>visible(a)&&text(a)==='Manage')) {
    const u = new URL(safeUrl(a.href));
    const key = u.searchParams.get('deliveryBundleId');
    let parent: Element | null = a.parentElement;
    while(parent && !parent.className.includes('deliveryCardLarge')) parent=parent.parentElement;
    if (!key || !parent || !/^Arriving\b/.test(text(parent))) throw new Error('Unrecognized upcoming delivery card');
    result.push({key,manageUrl:u.href,arrival:arrivalDate(text(parent).split('Last day to edit')[0],u)});
  }
  return result;
}
export async function destinationKey(raw: string): Promise<string> {
  if (!raw) throw new Error('Delivery destination unavailable');
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw.trim().replace(/\s+/g,' ').toUpperCase()));
  return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function detail(doc: Document, url: string, reference = today()): Promise<Group> {
  const u = new URL(safeUrl(url)); const key=u.searchParams.get('deliveryBundleId');
  if (!key) throw new Error('Expected a delivery group page');
  const headings=Array.from(doc.querySelectorAll('h2')).filter(h=>visible(h)&&/^Arriving /.test(text(h)));
  if(headings.length!==1) throw new Error('Unknown or split delivery date; manual review required');
  const arrival=arrivalDate(text(headings[0]),u,reference);
  const items: Item[] = Array.from(doc.querySelectorAll('[data-testid="desktop-subscription-tile"]')).filter(visible).map(tile=>{
    const title=text(tile.querySelector('[data-testid="product-title"]'));
    const quantity=text(tile.querySelector('[data-testid="product-qty-frequency"]'));
    const img=tile.querySelector('img')?.getAttribute('src')?.split('?')[0] ?? '';
    if(!title || !/^\d+ units? every /.test(quantity)) throw new Error('Unknown item quantity or title');
    // Rendered composite identity; fail closed for duplicates. No hidden account objects.
    return {key:JSON.stringify([title,img]),title,quantity,savings:text(tile.querySelector('[data-testid="product-price-row"]'))};
  });
  const count=text(doc.querySelector('[data-testid="delivery-item-count-desktop"]')).match(/^(\d+) items?$/);
  if(!count || Number(count[1])!==items.length || !items.length) throw new Error('Delivery membership is incomplete');
  const deadline=text(doc.querySelector('[data-testid="delivery-edit-deadline-date-desktop"]'));
  return {key,destinationKey:await destinationKey(text(doc.querySelector('[data-testid="delivery-address"]'))),arrival:{start:arrival,end:arrival},items,editDeadline:deadline?parseAmazonDate(deadline,arrival):undefined,manageUrl:u.href,observedAt:new Date().toISOString(),editable:Array.from(doc.querySelectorAll('button')).some(b=>visible(b)&&b.getAttribute('aria-label')==='Reschedule'&&!b.disabled)};
}
export function calendarDialog(doc: Document): HTMLElement {
  const dialogs=Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(e=>visible(e)&&text(e).includes('Choose your delivery day'));
  if(dialogs.length!==1 || !text(dialogs[0]).includes('This will only affect your next upcoming delivery.')) throw new Error('Unknown reschedule scope');
  return dialogs[0];
}
export function calendarDates(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('td[data-timestamp-utc]')).filter(td=>visible(td)&&td.classList.contains('a-cal-inbound')&&!td.classList.contains('a-cal-disabled')&&!!td.querySelector('a.a-cal-date-anchor')&&td.getAttribute('aria-disabled')!=='true').map(td=>{
    const date=new Date(Number(td.dataset.timestampUtc)).toISOString().slice(0,10);
    if(!validDate(date)) throw new Error('Unknown calendar date'); return date;
  });
}
export function pageSignature(doc: Document): string { return hubCards(doc).map(c=>c.key).join('|'); }
export function hubNext(doc: Document): HTMLElement | undefined {
  const first=Array.from(doc.querySelectorAll('a')).find(a=>visible(a)&&text(a)==='Manage');
  if(!first) return undefined;
  let root: Element | null=first.parentElement;
  while(root && !text(root).includes('Upcoming delivery days')) root=root.parentElement;
  if(!root) throw new Error('Upcoming delivery pagination unavailable');
  const next=Array.from(root.querySelectorAll<HTMLElement>('button')).filter(b=>visible(b)&&(b.getAttribute('aria-label')==='Next page'||text(b)==='Next page'));
  if(next.length!==1) throw new Error('Ambiguous upcoming delivery pagination');
  return next[0].hasAttribute('disabled') ? undefined : next[0];
}
