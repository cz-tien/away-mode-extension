import { candidate, merged, overlaps, today, addDays } from './dates';
import type { AwayWindow, Entry, Group } from './types';
export function membership(group: Group): string {
  return JSON.stringify([group.destinationKey,group.items.map(i=>[i.key,i.title,i.quantity]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}
export function fingerprint(group: Group): string { return JSON.stringify([membership(group),group.arrival,group.items.map(i=>[i.key,i.savings]).sort()]); }
export function planEntry(group: Group, windows: AwayWindow[], enabledDates: string[], preference: 'after'|'before' = 'after', horizonDays = 90): Entry {
  const trips = merged(windows).filter(w=>overlaps(group.arrival,w));
  const calendarLimit = addDays(trips.at(-1)?.end ?? group.arrival.end,horizonDays);
  const target = candidate(group.arrival,windows,enabledDates.filter(d=>d<=calendarLimit),preference);
  let reason: string | undefined;
  if (!trips.length) reason = 'Already safe';
  else if (!group.destinationKey || !group.items.length) reason = 'Destination or item identity unavailable';
  else if (!group.editable) reason = 'Amazon does not offer group rescheduling';
  else if (group.editDeadline && group.editDeadline < today()) reason = 'Edit deadline has passed';
  else if (new Set(group.items.map(i=>i.key)).size !== group.items.length) reason = 'Duplicate item identities require manual review';
  else if (!target) reason = 'No available date found within the checked horizon';
  return {id:group.key,group,fingerprint:fingerprint(group),target,preference,selected:!reason,status:reason?'blocked':'ready',reason,enabledDates,calendarLimit};
}
export function checkFresh(entry: Entry, fresh: Group): 'ready'|'verified' {
  if (membership(entry.group)!==membership(fresh)) throw new Error('Group destination or membership changed; review again');
  if (fresh.arrival.start === entry.target && fresh.arrival.end === entry.target) return 'verified';
  if (fingerprint(fresh)!==entry.fingerprint) throw new Error('Date, quantity, or savings changed; review again');
  if (!fresh.editable) throw new Error('Group is no longer editable');
  return 'ready';
}
