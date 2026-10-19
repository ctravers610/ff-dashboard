import type { InjuryStatus, WaiverPlayer } from '@ffd/shared';
import { describe, expect, it } from 'vitest';
import type { GameScore } from '../scoring/games.js';
import { claimWeek, pickAvailable, startablePositions, suggestMoves, type MoveInput } from './moves.js';

const wp = (name: string, position: string, week: number, restOfSeason: number, opts: { team?: string; injury?: InjuryStatus } = {}): WaiverPlayer => ({
  player: { playerId: name, name, position, nflTeam: opts.team ?? 'DAL', injuryStatus: opts.injury ?? null },
  week,
  restOfSeason,
  availability: 'free_agent',
  trendingAdds: null,
});

const game = (started: boolean): GameScore => ({ opponent: 'X', opponentScore: 0, started, progress: started ? 1 : 0, kickoff: null });

describe('claimWeek', () => {
  it('is this week until its first game kicks off, then next week', () => {
    expect(claimWeek(6, new Map([['DAL', game(false)]]))).toBe(6);
    expect(claimWeek(6, new Map([['DAL', game(false)], ['SF', game(true)]]))).toBe(7);
    expect(claimWeek(6, null)).toBe(7); // unknown: assume the week is underway
  });
});

describe('startablePositions', () => {
  it('expands flex slots into the positions they accept', () => {
    expect([...startablePositions(['QB', 'FLEX', 'BN'])].sort()).toEqual(['QB', 'RB', 'TE', 'WR']);
    expect(startablePositions(['QB', 'K', 'DEF']).has('WR')).toBe(false);
  });
});

describe('pickAvailable', () => {
  it('keeps the best at each position by this week and by rest of season', () => {
    const players = [wp('Streamer', 'WR', 15, 40), wp('Stash', 'WR', 2, 120), wp('Meh', 'WR', 5, 50), wp('Kicker', 'K', 9, 90)];
    const names = pickAvailable(players, new Set(['WR']), 1).map((p) => p.player.name).sort();
    expect(names).toEqual(['Stash', 'Streamer']);
  });
});

describe('suggestMoves', () => {
  const base = (over: Partial<MoveInput>): MoveInput => ({ starters: [], bench: [], available: [], openRosterSpots: 0, byeTeams: new Set(), ...over });

  it('fills a starter on bye with the best free agent and drops the weakest bench player', () => {
    const onBye = wp('Bye Guy', 'WR', 14, 150, { team: 'MIA' });
    const move = suggestMoves(
      base({
        starters: [{ slot: 'WR', player: onBye }],
        bench: [wp('Keeper', 'RB', 8, 90), wp('Spare', 'WR', 3, 20, { team: 'MIA' })],
        available: [wp('Streamer', 'WR', 12, 60), wp('Worse', 'WR', 7, 30)],
        byeTeams: new Set(['MIA']),
      }),
    );
    expect(move).toEqual([
      expect.objectContaining({ slot: 'WR', reason: 'bye', gain: 12, add: expect.objectContaining({ restOfSeason: 60 }), drop: expect.objectContaining({ restOfSeason: 20 }) }),
    ]);
    expect(move[0]!.add.player.name).toBe('Streamer');
    expect(move[0]!.drop!.player.name).toBe('Spare');
  });

  it('suggests nothing when a healthy bench player already covers the slot', () => {
    const moves = suggestMoves(
      base({
        starters: [{ slot: 'WR', player: wp('Hurt', 'WR', 10, 100, { injury: 'Out' }) }],
        bench: [wp('Backup', 'WR', 11, 70)],
        available: [wp('Free', 'WR', 10, 50)],
      }),
    );
    expect(moves).toEqual([]);
  });

  it('suggests an upgrade only when it beats the starter by the threshold', () => {
    const starter = { slot: 'TE', player: wp('Starter', 'TE', 8, 80) };
    const avail = (week: number) => [wp('Free TE', 'TE', week, 60)];
    expect(suggestMoves(base({ starters: [starter], available: avail(10), openRosterSpots: 1 }))).toEqual([]);
    expect(suggestMoves(base({ starters: [starter], available: avail(12), openRosterSpots: 1 }))[0]).toMatchObject({ reason: 'upgrade', gain: 4, drop: null });
  });

  it('never drops a player nobody available at his position could replace', () => {
    const moves = suggestMoves(
      base({
        starters: [{ slot: 'QB', player: null }],
        bench: [wp('Valuable', 'RB', 5, 150)],
        available: [wp('Streaming QB', 'QB', 18, 40)],
      }),
    );
    expect(moves).toEqual([]);
  });

  it('uses open roster spots before dropping anyone, biggest gain first', () => {
    const moves = suggestMoves(
      base({
        starters: [
          { slot: 'K', player: wp('Bye K', 'K', 9, 90, { team: 'MIA' }) },
          { slot: 'RB', player: null },
        ],
        bench: [wp('Cut me', 'TE', 0, 5)],
        available: [wp('Free K', 'K', 8, 70), wp('Free RB', 'RB', 15, 80), wp('Free TE', 'TE', 0, 30)],
        openRosterSpots: 1,
        byeTeams: new Set(['MIA']),
      }),
    );
    expect(moves.map((m) => [m.add.player.name, m.drop?.player.name ?? null])).toEqual([
      ['Free RB', null], // gain 15, takes the open spot
      ['Free K', 'Cut me'], // gain 8, needs a drop
    ]);
  });

  it('compares drops within a position, not across: a defense outscores a running back', () => {
    const moves = suggestMoves(
      base({
        starters: [{ slot: 'DEF', player: wp('Bye D', 'DEF', 8, 100, { team: 'MIA' }) }],
        bench: [wp('Solid RB', 'RB', 9, 70), wp('Backup D', 'DEF', 0, 40, { team: 'MIA' })],
        available: [wp('Stream D', 'DEF', 11, 110), wp('Waiver RB', 'RB', 6, 50)],
        byeTeams: new Set(['MIA']),
      }),
    );
    // The RB is worth more than any RB available, so he stays; the backup defense goes.
    expect(moves.map((m) => [m.add.player.name, m.drop?.player.name])).toEqual([['Stream D', 'Backup D']]);
  });
});
