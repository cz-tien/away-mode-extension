import { beforeEach,afterEach,vi } from 'vitest';
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));});
afterEach(()=>vi.useRealTimers());
