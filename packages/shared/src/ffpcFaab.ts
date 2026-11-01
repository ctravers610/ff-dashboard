// Reads FFPC's FAAB Report page, copied from the browser (Ctrl+A, Ctrl+C), into
// the claims it lists. FFPC has no API, so this page is how the bid model learns
// what FFPC leagues pay. Each claim is a winning row, then the bids that lost to it:
//
//   09/08 08:58 PM (WED)  Carcass Allen     Chris Bell, WR (MIA)  Eli Stowers TE PHI  $185.00  Player Added
//   09/08 10:36 PM (WED)  Club 223          Chris Bell, WR (MIA)                      $11.00   Matching High Bid Lost…
//   09/08 08:30 PM (WED)  Next Highest Bid  Chris Bell, WR (MIA)                      $75.00
//
// FFPC shows the next highest bid and your own, not every bid. A claim with no
// other rows had no other bid. A losing row's result text can't be trusted to say
// it tied ($11 above "matched" $185), so only its amount is used.
//
// The first column is when the bid was entered, and in brackets the day it was
// processed. Bids can be entered weeks ahead, so a row's own date says little.
// The page can also say "Week 1" over another week's rows, so its heading isn't
// used either: a run's date is the first such weekday from the latest bid in it.

export interface FfpcFaabClaim {
  runOn: string; // the day the bids were processed: "2026-09-09"
  player: string; // "Chris Bell", or "CHI DST" for a defense
  position: string; // QB, RB, WR, TE, K or DEF
  nflTeam: string; // as FFPC has it, which can be FA
  team: string; // the fantasy team that won him
  bid: number;
  losers: number[]; // the bids known to have lost to it: empty when no one else bid
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const BID_DATE = /^(\d{2})\/(\d{2})\s+\d{1,2}:\d{2}\s+[AP]M\s+\(([A-Z]{3})\)$/;
const PLAYER = /^(.+),\s*([A-Z]{2})\s*\(([A-Z]{2,3})\)$/; // "Keenan Allen, WR (IND)"
const DEFENSE = /^([A-Z]{2,3}) Team Defense$/;
const MONEY = /^\$([\d,]+(?:\.\d+)?)$/;
const POSITION_OUT: Record<string, string> = { PK: 'K', DF: 'DEF' };

const DAY = 24 * 60 * 60 * 1000;

export function looksLikeFfpcFaabReport(text: string): boolean {
  return /Free Agent Auction Bidding \(FAAB\)/.test(text) && /^Bid Date/m.test(text);
}

// `season` is the year the season started: January's bids belong to the next calendar year.
const bidTime = (month: number, day: number, season: string) => Date.UTC(Number(season) + (month < 8 ? 1 : 0), month - 1, day);

export function parseFfpcFaabReport(text: string, season: string): FfpcFaabClaim[] {
  const rows = text.split(/\r?\n/).flatMap((line) => {
    const [when, team, added, , amount, result] = line.split('\t').map((cell) => cell.trim());
    const date = BID_DATE.exec(when ?? '');
    const player = PLAYER.exec(added ?? '');
    const money = MONEY.exec(amount ?? '');
    if (!date || !team || !player || !money || !DAYS.includes(date[3]!)) return [];
    const defense = DEFENSE.exec(player[1]!);
    return [{
      enteredAt: bidTime(Number(date[1]), Number(date[2]), season),
      processedDay: date[3]!,
      team,
      player: defense ? `${defense[1]} DST` : player[1]!,
      position: POSITION_OUT[player[2]!] ?? player[2]!,
      nflTeam: player[3]!,
      bid: Number(money[1]!.replace(/,/g, '')),
      won: /Player Added/i.test(result ?? ''),
    }];
  });

  const latest = new Map<string, number>();
  for (const r of rows) latest.set(r.processedDay, Math.max(latest.get(r.processedDay) ?? 0, r.enteredAt));
  const runOn = (processedDay: string) => {
    const from = latest.get(processedDay)!;
    const days = (DAYS.indexOf(processedDay) - new Date(from).getUTCDay() + 7) % 7;
    return new Date(from + days * DAY).toISOString().slice(0, 10);
  };

  const claims: FfpcFaabClaim[] = [];
  for (const r of rows) {
    if (r.won) {
      claims.push({ runOn: runOn(r.processedDay), player: r.player, position: r.position, nflTeam: r.nflTeam, team: r.team, bid: r.bid, losers: [] });
      continue;
    }
    const claim = claims.at(-1);
    if (claim?.player === r.player) claim.losers.push(r.bid); // a bid on someone no one won isn't a claim
  }
  return claims;
}
