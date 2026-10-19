// Reads FFPC's add/drop page, copied from the browser (Ctrl+A, Ctrl+C), into
// your remaining FAAB, when bids are processed, the available players with
// FFPC's own projections, and your roster. FFPC has no API, so this page is
// how the Waivers tab learns about FFPC leagues. Each player is two lines:
//
//   Jones, Daniel IND (QB)                      ← name, team, position, injury code
//   TEN  13  11  13.75  18.35  12.91  64.55  90.6   ← Next Opp, Bye, Opp Rnk, Last, Proj, Avg, Pts, % Own
//
// and on the roster:
//
//   Maye, Drake NE (QB)
//   11  8  23.64  21.7                          ← Bye, PR, Proj, PPG

export interface FfpcWaiverPlayer {
  name: string; // "Daniel Jones", or "IND DST" for a defense
  nflTeam: string;
  position: string; // QB, RB, WR, TE, K or DEF
  injury: string | null; // FFPC's code: Q, D, O, ...
  bye: number | null;
  projected: number | null; // FFPC's projection for the coming week, in FFPC scoring
  percentOwned: number | null;
}

export interface FfpcWaiverPage {
  leagueNumber: string | null; // "#104790"
  teamName: string | null;
  faabLeft: number | null;
  bidSchedule: string | null; // "Wednesdays at 11 pm ET and Sundays at 10 am ET"
  teams: number | null;
  available: FfpcWaiverPlayer[];
  roster: FfpcWaiverPlayer[];
}

const PLAYER = /^([^,]+),\s*(.+?)\s+([A-Z]{2,3})\s+\((QB|RB|WR|TE|PK|K)\)(?:\s+([A-Z]{1,3}))?$/;
const DEFENSE = /^([A-Z]{2,3})\s+DST(?:\s+([A-Z]{1,3}))?$/;
const HEADER = /\)\s*(#\d+)\s*-\s*(.+?)\s*\(\d+-\d+(?:-\d+)?\)\s*$/;
const MONEY = /^\$([\d,]+)$/;
const POSITION_OUT: Record<string, string> = { PK: 'K' };

const num = (s: string | undefined) => {
  if (s == null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function looksLikeFfpcWaivers(text: string): boolean {
  return /Available Players/.test(text) && /Team Roster/.test(text) && /Remaining FAAB Dollars/i.test(text);
}

function playerCell(line: string): Omit<FfpcWaiverPlayer, 'bye' | 'projected' | 'percentOwned'> | null {
  const d = DEFENSE.exec(line);
  if (d) return { name: `${d[1]} DST`, nflTeam: d[1]!, position: 'DEF', injury: d[2] ?? null };
  const p = PLAYER.exec(line);
  if (!p) return null;
  return { name: `${p[2]} ${p[1]}`, nflTeam: p[3]!, position: POSITION_OUT[p[4]!] ?? p[4]!, injury: p[5] ?? null };
}

export function parseFfpcWaivers(text: string): FfpcWaiverPage {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const page: FfpcWaiverPage = {
    leagueNumber: null,
    teamName: null,
    faabLeft: null,
    bidSchedule: null,
    teams: null,
    available: [],
    roster: [],
  };

  let section: 'top' | 'budgets' | 'available' | 'roster' | 'done' = 'top';
  let budgets = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!page.leagueNumber) {
      const h = HEADER.exec(line);
      if (h) {
        page.leagueNumber = h[1]!;
        page.teamName = h[2]!;
      }
    }
    const faab = /Remaining FAAB Dollars:\s*\$([\d,]+)/i.exec(line);
    if (faab) page.faabLeft = num(faab[1]);
    const schedule = /Bids will be processed (.+?)\./i.exec(line);
    if (schedule) {
      page.bidSchedule = schedule[1]!;
      section = 'budgets'; // every other team's FAAB follows, as "$800" then the team name
      continue;
    }

    if (/^Bid Group Details/.test(line)) section = 'top';
    else if (/^Available Players/.test(line)) section = 'available';
    else if (/^Team Roster/.test(line)) section = 'roster';
    else if (/^©/.test(line)) section = 'done';

    if (section === 'budgets' && MONEY.test(line)) budgets++;
    if (section !== 'available' && section !== 'roster') continue;

    const cell = playerCell(line);
    if (!cell) continue;
    const stats = (lines[i + 1] ?? '').split(/\s+/);
    if (section === 'available') {
      // Next Opp, Bye, Opp Rnk, Last, Proj, Avg, Pts, % Own
      page.available.push({ ...cell, bye: num(stats[1]), projected: num(stats[4]), percentOwned: num(stats[7]) });
    } else {
      // Bye, PR, Proj, PPG
      page.roster.push({ ...cell, bye: num(stats[0]), projected: num(stats[2]), percentOwned: null });
    }
    i++; // the stats line is consumed
  }
  if (budgets > 0) page.teams = budgets + 1; // the list shows everyone but you
  return page;
}
