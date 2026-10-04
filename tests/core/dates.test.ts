import { describe, expect, it } from 'vitest';
import { addDays, candidate, merged, parseAmazonDate, validDate, validateWindows } from '../../src/core/dates';
import { checkFresh, fingerprint, planEntry } from '../../src/core/planner';
import { validateSettings } from '../../src/storage';
import type { Group } from '../../src/core/types';
const windows=[{id:'trip',start:'2026-10-10',end:'2026-10-17'}];
const arrival={start:'2026-10-17',end:'2026-10-18'};
export const group:Group={key:'bundle-a',destinationKey:'a'.repeat(64),arrival:{start:'2026-10-30',end:'2026-10-30'},items:[{key:'item-a',title:'Synthetic coffee',quantity:'1 unit every 2 weeks',savings:'Saving 5%'}],manageUrl:'https://www.amazon.com/auto-deliveries/?deliveryBundleId=bundle-a',observedAt:'2026-10-04T12:00:00Z',editable:true};
describe('calendar dates',()=>{
  it('rejects normalized invalid dates and timestamps',()=>{expect(validDate('2026-02-29')).toBe(false);expect(validDate('2028-02-29')).toBe(true);expect(validDate('2026-10-04T00:00:00Z')).toBe(false);});
  it('adds days across leap days, years and DST without shifting dates',()=>{expect(addDays('2028-02-28',1)).toBe('2028-02-29');expect(addDays('2026-12-31',1)).toBe('2027-01-01');expect(addDays('2026-03-08',1)).toBe('2026-03-09');});
  it('merges adjacent ranges but preserves input entries',()=>{const input=[...windows,{id:'next',start:'2026-10-18',end:'2026-10-20'}];expect(merged(input)).toEqual([{start:'2026-10-10',end:'2026-10-20'}]);expect(input).toHaveLength(2);});
  it('treats endpoints and single days as away',()=>{expect(candidate(arrival,windows,['2026-10-17','2026-10-18'],'after','2026-10-04')).toBe('2026-10-18');expect(candidate({start:'2026-10-10',end:'2026-10-10'},[{id:'one',start:'2026-10-10',end:'2026-10-10'}],['2026-10-10','2026-10-11'],'after','2026-10-04')).toBe('2026-10-11');});
  it('skips another trip and handles intervals crossing both trips',()=>{const trips=[...windows,{id:'two',start:'2026-10-19',end:'2026-10-22'}];expect(candidate(arrival,trips,['2026-10-19','2026-10-23'],'after','2026-10-04')).toBe('2026-10-23');expect(candidate({start:'2026-10-15',end:'2026-10-20'},trips,['2026-10-18','2026-10-23'],'after','2026-10-04')).toBe('2026-10-23');});
  it('picks latest safe date before departure and excludes past dates',()=>{expect(candidate(arrival,windows,['2026-10-03','2026-10-08','2026-10-09'],'before','2026-10-04')).toBe('2026-10-09');});
  it('does not invent unavailable replacement dates',()=>{expect(candidate(arrival,windows,['2026-10-10'],'after','2026-10-04')).toBeUndefined();});
  it('parses English dates with explicit year context',()=>{expect(parseAmazonDate('Arriving Fri, Jan 1','2026-12-01')).toBe('2027-01-01');expect(parseAmazonDate('Arriving Fri, Oct 30Last day to edit Sat, Oct 24','2026-10-04')).toBe('2026-10-30');expect(parseAmazonDate('October 30','2026-10-04')).toBe('2026-10-30');expect(()=>parseAmazonDate('10/11','2026-10-04')).toThrow();});
  it('rejects reversed and duplicate ranges',()=>{expect(()=>validateWindows([{id:'a',start:'2026-10-20',end:'2026-10-10'}])).toThrow();expect(()=>validateWindows([...windows,...windows])).toThrow();});
  it('validates imported settings and strips extra fields',()=>{const s=validateSettings({schemaVersion:1,windows,destination:'',horizonDays:90,secret:'no'});expect(s).not.toHaveProperty('secret');expect(()=>validateSettings({...s,schemaVersion:2})).toThrow();});
});
describe('reviewed plans',()=>{
  const trips=[{id:'trip',start:'2026-10-29',end:'2026-11-02'}];
  it('enforces horizon and live editability',()=>{expect(planEntry(group,trips,['2027-06-01']).status).toBe('blocked');expect(planEntry({...group,editable:false},trips,['2026-11-03']).status).toBe('blocked');});
  it('rejects duplicate item identities',()=>{expect(planEntry({...group,items:[...group.items,...group.items]},trips,['2026-11-03']).status).toBe('blocked');});
  it('rejects membership, destination, savings, and date changes',()=>{const entry=planEntry(group,trips,['2026-11-03']);for(const fresh of [{...group,destinationKey:'b'.repeat(64)},{...group,items:[]},{...group,items:[{...group.items[0],savings:'Saving 15%'}]},{...group,arrival:{start:'2026-10-31',end:'2026-10-31'}}])expect(()=>checkFresh(entry,fresh)).toThrow();});
  it('accepts changed bundle IDs only with exact membership at target',()=>{const entry=planEntry(group,trips,['2026-11-03']);expect(checkFresh(entry,{...group,key:'new',arrival:{start:'2026-11-03',end:'2026-11-03'}})).toBe('verified');expect(entry.fingerprint).toBe(fingerprint(group));});
});
