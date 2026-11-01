import type { Player } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { GameScore } from '../../scoring/games.js';
import { liveProjector } from './live.js';

const game = (progress: number): GameScore => ({ opponent: 'SEA', opponentScore: 0, started: progress > 0, progress, kickoff: null, clock: null });
const wr = (name: string, nflTeam: string | null): Player => ({ playerId: `yahoo:${name}`, name, position: 'WR', nflTeam, injuryStatus: null });

// Made-up projection: 5 catches and 60 yards, which 1 point a catch and 0.1 a yard scores 11.
const scoring = { rec: 1, rec_yd: 0.1 };
const sleeperIds = new Map([['WR:pukanacua', '4866']]);
const projections = new Map([['4866', { rec: 5, rec_yd: 60 }]]);

describe('liveProjector', () => {
  it('projects a player before kickoff, and his points once final', () => {
    const project = liveProjector(sleeperIds, projections, new Map([['LAR', game(0)]]), scoring);
    expect(project(wr('Puka Nacua', 'LAR'), 0)).toBe(11);
    expect(liveProjector(sleeperIds, projections, new Map([['LAR', game(1)]]), scoring)(wr('Puka Nacua', 'LAR'), 14)).toBe(14);
  });

  it("adds his projection for the share of the game left, to his points so far", () => {
    const project = liveProjector(sleeperIds, projections, new Map([['LAR', game(0.5)]]), scoring);
    expect(project(wr('Puka Nacua', 'LAR'), 4)).toBe(9.5); // 4 + 11 × half
  });

  it('counts a bye as 0 and a player with no projection as unknown', () => {
    const project = liveProjector(sleeperIds, projections, new Map([['LAR', game(0)]]), scoring);
    expect(project(wr('Some Rookie', 'KC'), 0)).toBe(0); // KC isn't in the schedule: on bye, so no projection either
    expect(project(wr('Some Rookie', 'LAR'), 0)).toBeNull(); // playing, but no projection to go by
    expect(liveProjector(sleeperIds, projections, new Map(), scoring)(wr('Some Rookie', 'LAR'), 0)).toBeNull(); // no schedule
  });
});
