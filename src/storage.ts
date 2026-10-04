import { validateWindows } from './core/dates';
import type { Settings, State } from './core/types';
export const defaults:Settings={schemaVersion:1,windows:[],destination:'',horizonDays:90};
export function validateSettings(value:unknown):Settings {
  const s=value as Partial<Settings>;
  if(!s||s.schemaVersion!==1||typeof s.destination!=='string'||(s.destination!==''&&!/^[a-f0-9]{64}$/.test(s.destination))||!Number.isInteger(s.horizonDays)||s.horizonDays!<1||s.horizonDays!>180) throw new Error('Unsupported settings file');
  return {schemaVersion:1,windows:validateWindows(s.windows),destination:s.destination,horizonDays:s.horizonDays!};
}
export async function load():Promise<State> { const {state}=await chrome.storage.local.get('state'); return state ? state as State : {settings:structuredClone(defaults)}; }
export async function save(state:State):Promise<void> { await chrome.storage.local.set({state}); }
