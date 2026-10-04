import type { AwayWindow, Interval, LocalDate } from './types';
export function validDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}
export function addDays(date: LocalDate, amount: number): LocalDate {
  if (!validDate(date)) throw new Error('Invalid calendar date');
  return new Date(Date.parse(date+'T00:00:00Z') + amount*86400000).toISOString().slice(0,10);
}
export function today(): LocalDate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function validateWindows(windows: unknown): AwayWindow[] {
  if (!Array.isArray(windows) || windows.length > 100) throw new Error('Expected up to 100 away ranges');
  const ids = new Set<string>();
  return windows.map(w => {
    if (!w || typeof w.id !== 'string' || !w.id || ids.has(w.id) || !validDate(w.start) || !validDate(w.end) || w.end < w.start) throw new Error('Invalid away range');
    ids.add(w.id);
    return {id:w.id,start:w.start,end:w.end,label:typeof w.label === 'string' ? w.label.slice(0,80) : undefined};
  });
}
export function merged(windows: AwayWindow[]): Interval[] {
  const result: Interval[] = [];
  for (const w of [...validateWindows(windows)].sort((a,b)=>a.start.localeCompare(b.start))) {
    const last = result.at(-1);
    if (last && w.start <= addDays(last.end,1)) last.end = last.end > w.end ? last.end : w.end;
    else result.push({start:w.start,end:w.end});
  }
  return result;
}
export function overlaps(a: Interval,b: Interval): boolean { return a.start <= b.end && b.start <= a.end; }
export function candidate(arrival: Interval, windows: AwayWindow[], enabled: LocalDate[], preference: 'after'|'before', current = today()): LocalDate | undefined {
  const trips = merged(windows); const conflicts = trips.filter(w=>overlaps(arrival,w));
  if (!conflicts.length) return undefined;
  const boundary = preference === 'after' ? conflicts.at(-1)!.end : conflicts[0].start;
  const safe = [...new Set(enabled)].filter(d=>validDate(d) && d >= current && !trips.some(w=>overlaps({start:d,end:d},w)) && (preference==='after' ? d>boundary : d<boundary)).sort();
  return preference==='after' ? safe[0] : safe.at(-1);
}
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export function parseAmazonDate(text: string, reference: LocalDate): LocalDate {
  const match = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(20\d{2}))?(?!\d)/);
  if (!match || !validDate(reference)) throw new Error('Unrecognized Amazon date');
  const month = months.findIndex(m=>m.startsWith(match[1]));
  let year = match[3] ? Number(match[3]) : Number(reference.slice(0,4));
  const refMonth = Number(reference.slice(5,7));
  if (!match[3] && month+1 < refMonth-6) year++;
  if (!match[3] && month+1 > refMonth+6) year--;
  const date = `${year}-${String(month+1).padStart(2,'0')}-${match[2].padStart(2,'0')}`;
  if (!validDate(date)) throw new Error('Invalid Amazon date');
  return date;
}
