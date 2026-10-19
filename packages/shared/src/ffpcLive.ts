// Reads a copied FFPC Live Scoring page (Ctrl+A, Ctrl+C) into a matchup
// snapshot: both teams' names, scores and starters with points.
//
// The page lists two score blocks ("Club 223 / In Play: … / Projected Points: … / 140.45"),
// then team 1's starters as groups (slot line, "Drake Maye NE", stats, "26.15"),
// then a "Pos  Bench  Status…" table, then team 2's starters and bench table.

import type { ManualMatchup, ManualMatchupSide } from './index';

const SLOT_LINE = /^(QB|RB|WR|TE|Flex|FLEX|SF|SFLEX|SuperFlex|SUPERFLEX|OP|PK|K|DST|DEF)$/;
const POINTS = /^-?\d+(?:\.\d+)?$/;
const PLAYER_LINE = /^(.+?)\s+([A-Z]{2,3})$/; // "Drake Maye NE"
const BENCH_HEADER = /^Pos\s+Bench\s+Status/;

const SLOT_OUT: Record<string, string> = { Flex: 'FLEX', SuperFlex: 'SUPERFLEX', PK: 'K', DST: 'DEF' };

export function looksLikeFfpcLiveScoring(text: string): boolean {
  return /Player Min Remaining:/.test(text) && /^Pos\s+Bench\s+Status/m.test(text);
}

function playerName(line: string): string {
  const m = PLAYER_LINE.exec(line);
  if (!m) return line;
  // Defenses read "SEA Team Defense SEA".
  return /Team Defense$/.test(m[1]!) ? `${m[2]} DST` : m[1]!;
}

export function convertFfpcLiveScoring(
  text: string,
  myTeamName?: string,
  capturedAt = new Date().toISOString(),
): ManualMatchup | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const week = Number(/Week\s+(\d+)\s*\(Current\)/.exec(text)?.[1] ?? 0);

  // Score blocks: a team name line followed by "In Play:".
  const teams: ManualMatchupSide[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i + 1]!.startsWith('In Play:')) continue;
    const projIdx = lines.findIndex((l, j) => j > i && l.startsWith('Projected Points:'));
    const score = lines.slice(projIdx + 1).find((l) => POINTS.test(l));
    teams.push({ teamName: lines[i]!, points: Number(score ?? 0), starters: [] });
  }
  if (teams.length < 2) return null;

  // Starters: team index advances each time a slot group follows a bench table.
  let team = 0;
  let inBench = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (BENCH_HEADER.test(line)) {
      inBench = true;
      continue;
    }
    const slot = SLOT_LINE.exec(line)?.[1];
    if (!slot) continue;
    if (inBench) {
      team++;
      inBench = false;
    }
    const side = teams[team];
    const nameLine = lines.slice(i + 1).find((l) => l !== '');
    if (!side || !nameLine) continue;
    const pointsLine = lines.slice(i + 2).find((l) => POINTS.test(l));
    side.starters.push({ slot: SLOT_OUT[slot] ?? slot, name: playerName(nameLine), points: Number(pointsLine ?? 0) });
  }

  let [me, opponent] = teams as [ManualMatchupSide, ManualMatchupSide];
  if (myTeamName && opponent.teamName.toLowerCase() === myTeamName.trim().toLowerCase()) {
    [me, opponent] = [opponent, me];
  }
  if (me.starters.length === 0) return null;
  return { week, capturedAt, me, opponent };
}
