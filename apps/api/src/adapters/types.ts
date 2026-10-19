import type { LeagueSummary, SourceError } from '@ffd/shared';

// What every platform adapter (Sleeper now; ESPN, Yahoo, FFPC later) returns.
export interface AdapterResult {
  leagues: LeagueSummary[];
  errors: SourceError[];
}
