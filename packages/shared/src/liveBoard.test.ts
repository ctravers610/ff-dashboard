import { describe, expect, it } from 'vitest';
import type { LiveEvent, LiveEventLeague } from './index';
import { buildBoard, describeStats, rowWhere } from './liveBoard';

const NOW = new Date('2026-11-01T18:00:00Z').getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const starter = (leagueName: string, points: number | null): LiveEventLeague => ({ leagueKey: leagueName, leagueName, platform: 'sleeper', role: 'starter', points });
const opponent = (leagueName: string, points: number | null): LiveEventLeague => ({ ...starter(leagueName, points), role: 'opponent' });
const bench = (leagueName: string, points: number | null): LiveEventLeague => ({ ...starter(leagueName, points), role: 'bench' });

// Plays are given oldest first, which reads better; the feed sends them newest first.
let nextId = 1;
const play = (minutes: number, name: string, description: string, ...leagues: LiveEventLeague[]): LiveEvent => ({
  id: nextId++,
  at: minutesAgo(minutes),
  week: 8,
  player: { playerId: name, name, position: name.endsWith('DEF') ? 'DEF' : 'RB', nflTeam: 'TB', injuryStatus: null },
  description,
  leagues,
});
const board = (...oldestFirst: LiveEvent[]) => buildBoard([...oldestFirst].reverse(), NOW);

describe('the live board', () => {
  it('adds a player’s small plays up into one row, in each league', () => {
    const { active } = board(
      play(4, 'Bucky Irving', '6 rush yds', starter('Massholes', 0.6), starter('Annex', 0.6)),
      play(3, 'Bucky Irving', '3 rush yds', starter('Massholes', 0.3), starter('Annex', 0.3)),
      play(2, 'Bucky Irving', '−1 rush yd', starter('Massholes', -0.1), starter('Annex', -0.1)),
    );
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ stats: '8 rush yds', net: 1.6, at: minutesAgo(2) });
    expect(active[0]!.lines.map((l) => l.points)).toEqual([0.8, 0.8]);
  });

  it('adds catches and yards up separately, and says them in the feed’s words', () => {
    const { active } = board(play(4, 'CeeDee Lamb', '1 catch, 3 rec yds', starter('A', 1.3)), play(3, 'CeeDee Lamb', '1 catch, 6 rec yds', starter('A', 1.6)));
    expect(active[0]!.stats).toBe('2 catches, 9 rec yds');
  });

  it('shows the change in your margin, so an opponent’s points count against you', () => {
    const { active } = board(play(2, 'CeeDee Lamb', '1 catch, 8 rec yds', opponent('Massholes', 2.8), opponent('Club 223', 2.8)));
    expect(active[0]!.net).toBe(-5.6);

    const { active: defense } = board(play(2, 'Pittsburgh DEF', 'points allowed changed', opponent('Boogaloo', -3)));
    expect(defense[0]).toMatchObject({ stats: 'Gave up more points', net: 3 });
  });

  it('nets a player out when he helps you in one league and hurts in another', () => {
    const { active } = board(play(2, 'Bucky Irving', '9 rush yds', starter('Massholes', 0.9), starter('Annex', 0.9), opponent('Boogaloo', 0.9)));
    expect(active[0]!.net).toBe(0.9);
  });

  it('puts a site catching up on the play that waited for it, without a row of its own', () => {
    const { active, earlier } = board(
      play(3, 'Bucky Irving', '6 rush yds', { ...starter('Massholes', null), platform: 'espn' }, starter('Annex', 0.6)),
      play(1, 'Bucky Irving', 'scoring update', { ...starter('Massholes', 0.6), platform: 'espn' }),
    );
    expect(active).toHaveLength(1);
    expect(earlier).toHaveLength(0);
    expect(active[0]).toMatchObject({ stats: '6 rush yds', net: 1.2, at: minutesAgo(3) }); // catching up isn't him doing something
    expect(active[0]!.lines.every((l) => !l.pending)).toBe(true);
  });

  it('holds a net of nothing as pending until a site reports', () => {
    const { active } = board(play(1, 'Jordan Mason', '2 rush yds', { ...starter('Massholes', null), platform: 'espn' }));
    expect(active[0]).toMatchObject({ net: null, benchOnly: false });
    expect(active[0]!.lines[0]!.pending).toBe(true);
  });

  it('keeps a scoring play apart from the run around it, even once the run moves on', () => {
    const { active, scoring } = board(
      play(4, 'CeeDee Lamb', '1 catch, 5 rec yds', starter('A', 1.5)),
      play(3, 'CeeDee Lamb', '1 catch, 1 rec TD, 20 rec yds', starter('A', 9)),
      play(2, 'CeeDee Lamb', '1 catch, 3 rec yds', starter('A', 1.3)),
    );
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ stats: '2 catches, 8 rec yds', net: 2.8 });
    expect(scoring).toHaveLength(1);
    expect(scoring[0]).toMatchObject({ kind: 'scoring', stats: '1 catch, 1 rec TD, 20 rec yds', net: 9 });
  });

  it('gives a scoring play the points its site was late with', () => {
    const { scoring, active } = board(
      play(4, 'Drake Maye', '1 pass TD, 25 pass yds', { ...starter('Massholes', null), platform: 'espn' }),
      play(2, 'Drake Maye', '5 pass yds', { ...starter('Massholes', 5.2), platform: 'espn' }),
    );
    expect(scoring[0]).toMatchObject({ net: 5.2 });
    expect(active[0]).toMatchObject({ stats: '5 pass yds' });
  });

  it('crosses out a play that was called back, as one row', () => {
    const { scoring, active } = board(play(4, 'Drake Maye', '1 pass TD, 25 pass yds', starter('A', 5)), play(2, 'Drake Maye', '−1 pass TD, −25 pass yds', starter('A', -5)));
    expect(active).toHaveLength(0);
    expect(scoring).toHaveLength(1);
    expect(scoring[0]).toMatchObject({ kind: 'calledBack', stats: '1 pass TD, 25 pass yds', at: minutesAgo(2) });
  });

  it('keeps a correction that only partly undoes a play as its own row, not a scoring play', () => {
    const { scoring } = board(play(4, 'Drake Maye', '1 pass TD, 25 pass yds', starter('A', 5)), play(2, 'Drake Maye', '−1 pass TD, −10 pass yds', starter('A', -4.4)));
    expect(scoring.map((r) => r.kind)).toEqual(['correction', 'scoring']);
  });

  it('drops a small play that was taken back, since the run adds up to nothing', () => {
    const { active } = board(play(4, 'Bucky Irving', '1 rush yd', starter('A', 0.1)), play(2, 'Bucky Irving', '−1 rush yd', starter('A', -0.1)));
    expect(active).toHaveLength(0);
  });

  it('starts a new run after the player has gone quiet, and moves the old one to earlier', () => {
    const { active, earlier } = board(play(30, 'Braelen Allen', '12 rush yds', starter('A', 1.2)), play(2, 'Braelen Allen', '4 rush yds', starter('A', 0.4)));
    expect(active[0]).toMatchObject({ stats: '4 rush yds' });
    expect(earlier[0]).toMatchObject({ stats: '12 rush yds' });
  });

  it('marks a bench-only player, who doesn’t count', () => {
    const { active, recentNet } = board(play(2, 'Kenny Gainwell', '21 rush yds', bench('Other', 2.1)));
    expect(active[0]).toMatchObject({ benchOnly: true, net: null });
    expect(recentNet).toBeNull();
  });

  it('nets the last five minutes, latest row first', () => {
    const { active, recentNet } = board(
      play(20, 'Old Play', '100 rush yds', starter('A', 10)),
      play(3, 'Braelen Allen', '36 rush yds', starter('A', 3.6)),
      play(1, 'CeeDee Lamb', '1 catch, 8 rec yds', opponent('A', 2.8)),
    );
    expect(recentNet).toBe(0.8);
    expect(active.map((r) => r.player.name)).toEqual(['CeeDee Lamb', 'Braelen Allen']);
  });
});

describe('where a row’s points landed', () => {
  const whereFor = (...leagues: LiveEventLeague[]) => rowWhere(board(play(1, 'Bucky Irving', '9 rush yds', ...leagues)).active[0]!);

  it('names one league', () => {
    expect(whereFor(starter('Massholes', 1))).toBe('Massholes');
    expect(whereFor(opponent('Massholes', 1))).toBe('vs you in Massholes');
    expect(whereFor(bench('Massholes', 1))).toBe('Massholes · bench');
  });

  it('counts several', () => {
    expect(whereFor(opponent('A', 1), opponent('B', 1))).toBe('vs you in 2 leagues');
    expect(whereFor(bench('A', 1), bench('B', 1))).toBe('on your bench in 2 leagues');
    expect(whereFor(starter('A', 1), opponent('B', 1), bench('C', 1), starter('D', null))).toBe('4 leagues, 1 against you, 1 on your bench, 1 pending');
  });
});

describe('describing stat changes', () => {
  it('uses the singular for one, and marks a correction', () => {
    expect(describeStats({ rec: 1, rec_yd: 14 })).toBe('1 catch, 14 rec yds');
    expect(describeStats({ rush_yd: -1 })).toBe('−1 rush yd');
  });
});
