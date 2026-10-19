// Turns pasted roster text into players, using Sleeper's player database to
// fill in position, NFL team and injury status.
//
//   QB Josh Allen          → starter at QB
//   FLEX: Puka Nacua       → starter at FLEX
//   BN Najee Harris        → bench
//   IR Jonathon Brooks     → injured reserve
//   Bills D/ST             → no prefix = bench

import type { Player, RosterStatus } from '@ffd/shared';
import { normalizeName } from '../../exposure.js';
import { toPlayer } from '../sleeper/mapper.js';
import type { SleeperPlayerMap } from '../sleeper/types.js';

const SLOT_ALIASES: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', PK: 'K',
  DEF: 'DEF', DST: 'DEF', 'D/ST': 'DEF',
  FLEX: 'FLEX', WRT: 'FLEX', 'W/R/T': 'FLEX',
  SF: 'SUPERFLEX', SFLEX: 'SUPERFLEX', SUPERFLEX: 'SUPERFLEX', OP: 'SUPERFLEX',
  BN: 'BN', BENCH: 'BN', IR: 'IR', RES: 'IR',
};
const POSITION_SLOTS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

export interface ParsedLine {
  slot: string | null; // normalized slot, e.g. "WR", "FLEX", "BN"
  name: string;
}

export function parseRosterText(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    let slot: string | null = null;
    const prefix = /^([A-Za-z/]+)\s*[:\-–]?\s+(.+)$/.exec(line);
    const alias = prefix && SLOT_ALIASES[prefix[1]!.toUpperCase()];
    if (prefix && alias) {
      slot = alias;
      line = prefix[2]!;
    }

    // Drop decorations like "(BUF)", "- BUF" or ", WR" copied from a website.
    line = line.replace(/\(.*?\)/g, '').replace(/\s*[-–,]\s*[A-Z]{1,3}\s*$/, '').trim();
    if (line) lines.push({ slot, name: line });
  }
  return lines;
}

export function statusForSlot(slot: string | null): RosterStatus {
  if (slot === 'BN' || slot === null) return 'bench';
  if (slot === 'IR') return 'ir';
  return 'starter';
}

export interface PlayerIndex {
  byName: Map<string, Player[]>;
  defenses: Map<string, Player>; // keyed by team code, full name, city and nickname
}

export function buildPlayerIndex(players: SleeperPlayerMap): PlayerIndex {
  const byName = new Map<string, Player[]>();
  const defenses = new Map<string, Player>();

  for (const id of Object.keys(players)) {
    const player = toPlayer(id, players);
    if (!player || !FANTASY_POSITIONS.has(player.position)) continue;

    if (player.position === 'DEF') {
      const words = player.name.split(' ');
      const keys = [id, player.name, words.at(-1) ?? '', words.slice(0, -1).join(' ')];
      for (const key of keys) if (key) defenses.set(normalizeName(key), player);
      continue;
    }
    const key = normalizeName(player.name);
    byName.set(key, [...(byName.get(key) ?? []), player]);
  }
  return { byName, defenses };
}

const DEFENSE_WORDS = /\b(d\/st|dst|defense|def)\b/gi;

export function resolvePlayer(line: ParsedLine, index: PlayerIndex): Player | null {
  const wantDefense = line.slot === 'DEF' || DEFENSE_WORDS.test(line.name);
  DEFENSE_WORDS.lastIndex = 0;
  if (wantDefense) {
    return index.defenses.get(normalizeName(line.name.replace(DEFENSE_WORDS, ''))) ?? null;
  }

  let candidates = index.byName.get(normalizeName(line.name)) ?? [];
  if (line.slot && POSITION_SLOTS.has(line.slot)) {
    candidates = candidates.filter((p) => p.position === line.slot);
  }
  // Prefer players currently on an NFL team over retired/free-agent namesakes.
  const match = candidates.find((p) => p.nflTeam) ?? candidates[0];
  if (match) return match;

  // Last resort: a bare team name like "Bills" with no slot is a defense.
  return index.defenses.get(normalizeName(line.name)) ?? null;
}
