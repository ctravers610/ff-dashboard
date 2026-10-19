import { describe, expect, it } from 'vitest';
import type { SleeperPlayerMap } from '../sleeper/types.js';
import { buildPlayerIndex, parseRosterText, resolvePlayer, statusForSlot } from './parse.js';

const players: SleeperPlayerMap = {
  '4984': { name: 'Josh Allen', position: 'QB', team: 'BUF', injury_status: null },
  '1000': { name: 'Josh Allen', position: 'LB', team: 'JAX', injury_status: null },
  '7564': { name: 'A.J. Brown', position: 'WR', team: 'PHI', injury_status: 'Questionable' },
  '9001': { name: 'Mike Williams', position: 'WR', team: null, injury_status: null },
  '9002': { name: 'Mike Williams', position: 'WR', team: 'PIT', injury_status: null },
  '6813': { name: 'Marvin Harrison', position: 'WR', team: 'ARI', injury_status: null },
  BUF: { name: 'Buffalo Bills', position: 'DEF', team: 'BUF', injury_status: null },
};
const index = buildPlayerIndex(players);
const resolve = (text: string) => resolvePlayer(parseRosterText(text)[0]!, index);

describe('parseRosterText', () => {
  it('reads slot prefixes, separators and skips blank lines and comments', () => {
    expect(parseRosterText('QB Josh Allen\n\n# bench\nFLEX: Puka Nacua\nbn - Najee Harris\nIR Jonathon Brooks\nBijan Robinson')).toEqual([
      { slot: 'QB', name: 'Josh Allen' },
      { slot: 'FLEX', name: 'Puka Nacua' },
      { slot: 'BN', name: 'Najee Harris' },
      { slot: 'IR', name: 'Jonathon Brooks' },
      { slot: null, name: 'Bijan Robinson' },
    ]);
  });

  it('strips team decorations copied from a website', () => {
    expect(parseRosterText('WR A.J. Brown (PHI)\nWR Mike Williams - PIT').map((l) => l.name)).toEqual([
      'A.J. Brown',
      'Mike Williams',
    ]);
  });

  it('does not treat a first name as a slot', () => {
    expect(parseRosterText('Josh Allen')).toEqual([{ slot: null, name: 'Josh Allen' }]);
  });

  it('maps slots to roster status', () => {
    expect([statusForSlot('QB'), statusForSlot('FLEX'), statusForSlot('BN'), statusForSlot('IR'), statusForSlot(null)]).toEqual([
      'starter', 'starter', 'bench', 'ir', 'bench',
    ]);
  });
});

describe('resolvePlayer', () => {
  it('matches names loosely and keeps injury status', () => {
    expect(resolve('WR AJ Brown')).toMatchObject({ playerId: '7564', injuryStatus: 'Questionable' });
    expect(resolve('Marvin Harrison Jr.')).toMatchObject({ playerId: '6813' });
  });

  it('uses the slot to pick the right position among namesakes', () => {
    expect(resolve('QB Josh Allen')?.playerId).toBe('4984');
  });

  it('prefers the namesake currently on an NFL team', () => {
    expect(resolve('Mike Williams')?.nflTeam).toBe('PIT');
  });

  it('finds defenses by nickname, city, full name or team code', () => {
    for (const text of ['DEF Bills', 'Bills D/ST', 'DST Buffalo', 'Buffalo Bills Defense', 'DEF BUF', 'Bills']) {
      expect(resolve(text)?.playerId, text).toBe('BUF');
    }
  });

  it('returns null for unknown players', () => {
    expect(resolve('WR Not A Real Player')).toBeNull();
  });
});
