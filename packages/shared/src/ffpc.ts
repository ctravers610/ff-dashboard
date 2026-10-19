// Converts a copied FFPC team page (Ctrl+A, Ctrl+C on the roster page) into
// the simple roster format the manual importer understands:
//
//   QB\tMaye, Drake NE   Submit\tQB\tNYJ   →  QB Drake Maye
//   (Bench) WR\tEvans, Mike SF Q   Submit…  →  BN Mike Evans
//   DST\tSEA DST  \tDST\t@DEN              →  DEF SEA DST

export interface FfpcImport {
  leagueName: string | null;
  teamName: string | null;
  rosterText: string;
  players: number;
}

const SLOTS = 'QB|RB|WR|TE|FLEX|SF|SFLEX|SUPERFLEX|OP|PK|K|DST|DEF';
// A roster row: slot, then the player cell, then the position column.
const ROW = new RegExp(`^(${SLOTS})[\\t ]+(.+?)\\s*(?:Submit)?\\s*\\t\\s*(?:QB|RB|WR|TE|PK|K|DST)\\b`);
// "Last, First TEAM" with an optional injury code (Q, D, O, IR, ...).
const PLAYER_CELL = /^([^,]+),\s*(.+?)\s+([A-Z]{2,3})(?:\s+([A-Z]{1,3}))?$/;
const DEFENSE_CELL = /^([A-Z]{2,3})\s+DST$/;
// "Big Gorilla Tourney (Aug 5 9:00 PM) #104790 - Club 223 (2-3)"
const HEADER = /^(.+?)\s*\([^)]*\)\s*(#\d+)\s*-\s*(.+?)\s*\(\d+-\d+(?:-\d+)?\)\s*$/;

const SLOT_OUT: Record<string, string> = { PK: 'K', DST: 'DEF' };

export function looksLikeFfpcPage(text: string): boolean {
  return /^SLOT\s+PLAYER\s+POS/m.test(text);
}

function playerName(cell: string): string | null {
  const cleaned = cell.replace(/\s*Submit\s*$/, '').trim();
  const defense = DEFENSE_CELL.exec(cleaned);
  if (defense) return `${defense[1]} DST`;
  const player = PLAYER_CELL.exec(cleaned);
  return player ? `${player[2]} ${player[1]}` : null;
}

export function convertFfpcPage(text: string): FfpcImport {
  let leagueName: string | null = null;
  let teamName: string | null = null;
  let section: 'starter' | 'bench' | 'ir' = 'starter';
  const out: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    const header: RegExpExecArray | null = leagueName ? null : HEADER.exec(trimmed);
    if (header) {
      leagueName = `${header[1]} ${header[2]}`;
      teamName = header[3]!;
      continue;
    }
    if (/^Starters$/i.test(trimmed)) section = 'starter';
    else if (/^(Bench|Taxi.*)$/i.test(trimmed)) section = 'bench';
    else if (/^(IR|Injured Reserve|Reserve)$/i.test(trimmed)) section = 'ir';

    const row = ROW.exec(line);
    if (!row) continue;
    const name = playerName(row[2]!);
    if (!name) continue;

    const slot = section === 'starter' ? (SLOT_OUT[row[1]!] ?? row[1]!) : section === 'bench' ? 'BN' : 'IR';
    out.push(`${slot} ${name}`);
  }

  return { leagueName, teamName, rosterText: out.join('\n'), players: out.length };
}
