import { describe, expect, it } from 'vitest';
import { gameProgress } from './games.js';
import { pointsAllowed } from './live.js';
import { liveProjection, scoreWithSettings } from './projection.js';

const game = (opponentScore: number, started = true) => ({ opponent: 'DEN', opponentScore, started, progress: 0.5 });

describe('pointsAllowed', () => {
  it("is null before kickoff so an unplayed game isn't a shutout", () => {
    expect(pointsAllowed(game(0, false))).toBeNull();
    expect(pointsAllowed(undefined)).toBeNull();
  });

  it("is the opponent's score once the game has started", () => {
    expect(pointsAllowed(game(17))).toBe(17);
  });

  it("excludes the opponent's defensive and return touchdowns", () => {
    expect(pointsAllowed(game(24), { def_td: 1, def_st_td: 1 })).toBe(10);
  });
});

describe('gameProgress', () => {
  it('maps the game clock to the share of the game played', () => {
    expect(gameProgress('pre')).toBe(0);
    expect(gameProgress('in', 1, 15 * 60)).toBe(0);
    expect(gameProgress('in', 2, 0)).toBe(0.5);
    expect(gameProgress('in', 3, 7.5 * 60)).toBe(0.625);
    expect(gameProgress('in', 5, 300)).toBe(0.98); // overtime
    expect(gameProgress('post', 4, 0)).toBe(1);
  });
});

describe('liveProjection', () => {
  it('uses the projection before kickoff and actual points once final', () => {
    expect(liveProjection(0, 18, 0)).toBe(18);
    expect(liveProjection(26.15, 20.48, 1)).toBe(26.15);
  });

  it('adds the projection for the remaining share of the game', () => {
    expect(liveProjection(10, 20, 0.5)).toBe(20);
    expect(liveProjection(3, 16, 0.75)).toBe(7);
  });
});

describe('scoreWithSettings', () => {
  it("scores stats with a Sleeper league's own settings, including indicator fields", () => {
    const settings = { pass_yd: 0.04, pass_td: 6, rec: 1, bonus_rec_te: 0.5, pts_allow_14_20: 5, sack: 1 };
    expect(scoreWithSettings({ pass_yd: 250, pass_td: 2 }, settings)).toBe(22);
    expect(scoreWithSettings({ rec: 6, bonus_rec_te: 6 }, settings)).toBe(9);
    expect(scoreWithSettings({ pts_allow_14_20: 1, sack: 2.3, yds_allow: 300 }, settings)).toBe(7.3);
  });
});
