import type { Entry, Group, Run } from './types';
import { checkFresh } from './planner';
export interface Executor {
  resolve(entry: Entry): Promise<Group>;
  prepare(entry: Entry): Promise<void>;
  confirm(entry: Entry): Promise<void>;
  verify(entry: Entry): Promise<Group>;
}
export async function execute(run: Run, executor: Executor, save: () => Promise<void>, alive: () => boolean): Promise<void> {
  for (const entry of run.entries) {
    if (!entry.selected || entry.status!=='ready' || run.stopped || !alive()) continue;
    let consequential = false;
    try {
      if (checkFresh(entry,await executor.resolve(entry))==='verified') { entry.status='verified'; await save(); continue; }
      await executor.prepare(entry);
      if (run.stopped || !alive()) break;
      entry.status='applying'; await save();
      if (run.stopped || !alive()) { entry.status='ready'; await save(); break; }
      consequential=true;
      await executor.confirm(entry);
      entry.status='verifying'; await save();
      const fresh = await executor.verify(entry);
      if (checkFresh(entry,fresh)!=='verified') throw new Error('Amazon did not show the reviewed items at the target date');
      entry.status='verified'; entry.reason=undefined; await save();
    } catch (error) {
      entry.status=consequential?'unknown':'blocked'; entry.reason=error instanceof Error ? error.message : 'Unexpected failure';
      // A changed group may reflect a merge affecting the rest of the frozen plan.
      run.stopped=true; await save(); break;
    }
  }
  run.active=false;
  await save();
}
export function interrupt(run: Run): Run {
  run.active=false; run.stopped=true;
  for (const e of run.entries) if (e.status==='applying'||e.status==='verifying') { e.status='unknown'; e.reason='Interrupted: reconcile from Amazon before another write'; }
  return run;
}
