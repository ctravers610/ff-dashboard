import type { LeagueSource } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { espnLeagueId } from './routes.js';
import { activeSources, allSources, type SourceStore } from './store.js';

describe('espnLeagueId', () => {
  it('takes a bare id or any ESPN league address', () => {
    expect(espnLeagueId('13396297')).toBe('13396297');
    expect(espnLeagueId(' https://fantasy.espn.com/football/league?leagueId=13396297 ')).toBe('13396297');
    expect(espnLeagueId('https://fantasy.espn.com/football/team?leagueId=13396297&teamId=4&seasonId=2026')).toBe('13396297');
  });

  it('rejects anything else', () => {
    expect(espnLeagueId('not a league')).toBeNull();
    expect(espnLeagueId('https://fantasy.espn.com/football/league')).toBeNull();
  });
});

const fakeStore = (rows: LeagueSource[], fail = false) =>
  ({ list: async () => (fail ? Promise.reject(new Error('db down')) : rows) }) as unknown as SourceStore;
const added = (platform: LeagueSource['platform'], value: string, id = 1): LeagueSource => ({ id, platform, value, label: null, fromEnv: false });

describe('allSources', () => {
  it('puts .env first, then what was added in the app, without duplicates', async () => {
    const envUser = config.sleeperUsernames[0];
    const rows = [added('sleeper', 'new_friend', 1), ...(envUser ? [added('sleeper', envUser.toUpperCase(), 2)] : [])];
    const all = await allSources(fakeStore(rows));
    expect(all.filter((s) => s.fromEnv)).toHaveLength(config.sleeperUsernames.length + config.espnLeagueIds.length);
    expect(all.filter((s) => !s.fromEnv).map((s) => s.value)).toEqual(['new_friend']); // the env user, in other case, is the same account
  });

  it('still returns the .env sources when the database is down', async () => {
    const all = await allSources(fakeStore([], true));
    expect(all.every((s) => s.fromEnv)).toBe(true);
  });

  it('splits into what the dashboard fetches', async () => {
    const sources = await activeSources(fakeStore([added('espn', '777777')]));
    expect(sources.espnLeagueIds).toContain('777777');
    expect(sources.sleeperUsernames).toEqual(config.sleeperUsernames);
  });
});
