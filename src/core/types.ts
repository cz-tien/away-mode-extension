export type LocalDate = string;
export interface AwayWindow { id: string; start: LocalDate; end: LocalDate; label?: string }
export interface Interval { start: LocalDate; end: LocalDate }
export interface Item { key: string; title: string; quantity: string; savings: string }
export interface Group {
  key: string; destinationKey: string; arrival: Interval; editDeadline?: LocalDate;
  items: Item[]; manageUrl: string; observedAt: string; editable: boolean;
}
export interface Coverage { pages: number; dates: LocalDate[]; complete: boolean; issues: string[]; ordinaryOrders: false; observedAt: string }
export interface Scan { groups: Group[]; coverage: Coverage }
export type Status = 'ready' | 'blocked' | 'applying' | 'verifying' | 'verified' | 'failed' | 'unknown';
export interface Entry {
  id: string; group: Group; fingerprint: string; target?: LocalDate; preference: 'after' | 'before';
  selected: boolean; status: Status; reason?: string; enabledDates: LocalDate[]; calendarLimit: LocalDate;
}
export interface Run { id: string; entries: Entry[]; windows: AwayWindow[]; destination: string; stopped: boolean; active: boolean; startedAt: string }
export interface Settings { schemaVersion: 1; windows: AwayWindow[]; destination: string; horizonDays: number }
export interface State { settings: Settings; scan?: Scan; plan?: Entry[]; run?: Run; workingTab?: number; error?: string; busy?: string }
