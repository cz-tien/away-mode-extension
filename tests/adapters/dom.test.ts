// @vitest-environment jsdom
import { beforeEach,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { arrivalDate, button, calendarDates, calendarDialog, detail, hubCards, safeUrl } from '../../src/adapters/amazon/dom';
const fixture=readFileSync('tests/fixtures/amazon/group.html','utf8');
beforeEach(()=>{document.body.innerHTML=fixture;vi.spyOn(Element.prototype,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);vi.stubGlobal('crypto',webcrypto);});
it('reads complete rendered membership and stores only a destination hash',async()=>{const g=await detail(document,'https://www.amazon.com/auto-deliveries/?deliveryBundleId=test','2026-10-04');expect(g.items).toHaveLength(1);expect(g.destinationKey).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(g)).not.toContain('SAMPLE ROAD');expect(g.editDeadline).toBe('2026-10-24');});
it('rejects truncated item lists and split arrival dates',async()=>{document.querySelector('[data-testid="delivery-item-count-desktop"]')!.textContent='2 items';await expect(detail(document,'https://www.amazon.com/auto-deliveries/?deliveryBundleId=test')).rejects.toThrow('incomplete');});
it('blocks group without address',async()=>{document.querySelector('[data-testid="delivery-address"]')!.remove();await expect(detail(document,'https://www.amazon.com/auto-deliveries/?deliveryBundleId=test')).rejects.toThrow('destination');});
it('only returns enabled UTC calendar dates and verifies scope',()=>{expect(calendarDates(calendarDialog(document))).toEqual(['2026-11-03']);document.querySelector('[role="dialog"] p')!.remove();expect(()=>calendarDialog(document)).toThrow('scope');});
it('rejects arbitrary hostnames and unexpected paths',()=>{for(const url of ['https://evil.test/auto-deliveries','https://www.amazon.com/gp/buy','https://www.amazon.com.evil.test/auto-deliveries'])expect(()=>safeUrl(url)).toThrow();});
it('never treats skip/cancel controls as reschedule confirmation',()=>{expect(button(calendarDialog(document),'Confirm').textContent).toBe('Confirm');expect(()=>button(document,'Purchase')).toThrow();});
it('rejects ambiguous confirmation controls',()=>{const extra=document.createElement('button');extra.textContent='Confirm';document.querySelector('[role=dialog]')!.append(extra);expect(()=>button(calendarDialog(document),'Confirm')).toThrow();});
it('keeps recommendations separate from upcoming delivery cards',()=>{document.body.innerHTML='<section>Upcoming delivery days<div class="deliveryCardLarge"><span>Arriving Fri, Oct 30</span><a href="https://www.amazon.com/auto-deliveries/?deliveryBundleId=test">Manage</a></div></section><section><a href="/dp/fake">Subscribe now</a></section>';expect(hubCards(document)).toHaveLength(1);});
it('uses management-link year for far-future deliveries',()=>{expect(arrivalDate('Arriving April 2',new URL('https://www.amazon.com/auto-deliveries/?deliveryDate=1806663600000'),'2026-10-04')).toBe('2027-04-02');});
it('rejects arrival intervals rather than treating the start as a guaranteed day',()=>{expect(()=>arrivalDate('Arriving October 30 – November 2',new URL('https://www.amazon.com/auto-deliveries/'),'2026-10-04')).toThrow();});
