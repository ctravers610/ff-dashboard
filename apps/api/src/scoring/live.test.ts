import { describe, expect, it } from 'vitest';
import { pointsAllowed } from './live.js';

describe('pointsAllowed', () => {
  it("is null before kickoff so an unplayed game isn't a shutout", () => {
    expect(pointsAllowed({ opponent: 'DEN', opponentScore: 0, started: false })).toBeNull();
    expect(pointsAllowed(undefined)).toBeNull();
  });

  it("is the opponent's score once the game has started", () => {
    expect(pointsAllowed({ opponent: 'DEN', opponentScore: 17, started: true })).toBe(17);
  });

  it("excludes the opponent's defensive and return touchdowns", () => {
    expect(pointsAllowed({ opponent: 'DEN', opponentScore: 24, started: true }, { def_td: 1, def_st_td: 1 })).toBe(10);
  });
});
