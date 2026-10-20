// The Tuesday-morning push: last week across every league, in one notification.

import { easternParts, type RecapResponse } from '@ffd/shared';

/** From Tuesday 9 AM Eastern until Wednesday noon: after Monday night, before the week moves on. */
export function isRecapTime(now: Date): boolean {
  const { weekday, hour } = easternParts(now);
  return (weekday === 2 && hour >= 9) || (weekday === 3 && hour < 12);
}

export const recapKey = (season: string, week: number) => `recap:${season}:${week}`;

/** Next week's opponent in one league, for the closing line of the recap. */
export interface NextUp {
  leagueName: string;
  teamName: string;
  winChance: number;
}

export function recapMessage(recap: RecapResponse, nextUp: NextUp[] = []) {
  const decided = recap.leagues.filter((l) => l.result);
  const wins = decided.filter((l) => l.result === 'win').length;
  const losses = decided.filter((l) => l.result === 'loss').length;
  const left = recap.leagues.reduce((sum, l) => sum + l.leftOnBench, 0);
  const flips = recap.leagues.filter((l) => l.bestWouldWin).map((l) => l.leagueName);
  const biggest = recap.leagues
    .flatMap((l) => l.calls.map((c) => ({ ...c, league: l.leagueName })))
    .sort((a, b) => b.cost - a.cost)[0];

  const lines = [`${left.toFixed(1)} points left on benches.`];
  if (flips.length) lines.push(`The best lineup would have won ${flips.join(' and ')}.`);
  if (biggest) lines.push(`Biggest miss: ${biggest.better.name} over ${biggest.started.name} in ${biggest.league} (+${biggest.cost.toFixed(1)}).`);
  const toughest = [...nextUp].sort((a, b) => a.winChance - b.winChance)[0];
  if (toughest) lines.push(`Toughest next: ${toughest.teamName} in ${toughest.leagueName} (${Math.round(toughest.winChance * 100)}% to win).`);
  return {
    title: `Week ${recap.week} recap: ${wins}-${losses}${decided.length < recap.leagues.length ? ' (plus all-play)' : ''}`,
    body: lines.join(' '),
    url: '/?view=history',
    tag: 'recap',
  };
}
