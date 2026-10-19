// The player pool shared by every fixture. Sleeper, ESPN and the FFPC page all
// describe the same real-world players in their own formats, which is exactly
// what the cross-league Players tab has to line up.

export interface FxPlayer {
  id: string; // Sleeper id (team code for defenses)
  espnId: number;
  name: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
  team: string;
  injury?: 'Questionable';
}

const p = (id: string, name: string, position: FxPlayer['position'], team: string, injury?: 'Questionable'): FxPlayer => ({
  id,
  espnId: 3_900_000 + (Number(id) || id.charCodeAt(0) * 10 + id.charCodeAt(1)),
  name,
  position,
  team,
  injury,
});

export const PLAYERS = {
  allen: p('4984', 'Josh Allen', 'QB', 'BUF'),
  maye: p('1001', 'Drake Maye', 'QB', 'NE'),
  mahomes: p('1011', 'Patrick Mahomes', 'QB', 'KC'),
  bijan: p('9221', 'Bijan Robinson', 'RB', 'ATL'),
  cook: p('1003', 'James Cook', 'RB', 'BUF'),
  najee: p('1007', 'Najee Harris', 'RB', 'NYG'),
  henry: p('1010', 'Derrick Henry', 'RB', 'BAL'),
  saquon: p('1013', 'Saquon Barkley', 'RB', 'PHI'),
  hall: p('1014', 'Breece Hall', 'RB', 'NYJ'),
  brooks: p('1012', 'Jonathon Brooks', 'RB', 'CAR'),
  nabers: p('8137', 'Malik Nabers', 'WR', 'NYG'),
  puka: p('6790', 'Puka Nacua', 'WR', 'LAR'),
  evans: p('1004', 'Mike Evans', 'WR', 'SF'),
  waddle: p('1002', 'Jaylen Waddle', 'WR', 'DEN', 'Questionable'),
  higgins: p('1008', 'Tee Higgins', 'WR', 'CIN'),
  olave: p('1015', 'Chris Olave', 'WR', 'NO'),
  rice: p('1016', 'Rashee Rice', 'WR', 'KC'),
  reed: p('1017', 'Jayden Reed', 'WR', 'GB', 'Questionable'),
  doubs: p('1018', 'Romeo Doubs', 'WR', 'GB'),
  bowers: p('9487', 'Brock Bowers', 'TE', 'LV'),
  kelce: p('1009', 'Travis Kelce', 'TE', 'KC'),
  little: p('3451', 'Cam Little', 'K', 'JAX'),
  pineiro: p('1005', 'Eddy Pineiro', 'K', 'SF'),
  bufDef: p('BUF', 'Buffalo Bills', 'DEF', 'BUF'),
  seaDef: p('SEA', 'Seattle Seahawks', 'DEF', 'SEA'),
} satisfies Record<string, FxPlayer>;

export type PlayerKey = keyof typeof PLAYERS;
export const ALL_PLAYERS = Object.values(PLAYERS);

// NFL games for the fixture week. Every game a scored player is in is final, so
// live scores and projections have a single deterministic answer. [home, homeScore, away, awayScore]
export const GAMES: [string, number, string, number][] = [
  ['BUF', 24, 'MIA', 17],
  ['NE', 20, 'NYJ', 10],
  ['KC', 31, 'LV', 17],
  ['ATL', 27, 'NO', 21],
  ['NYG', 14, 'DAL', 28],
  ['LAR', 23, 'SF', 20],
  ['JAX', 24, 'HOU', 30],
  ['SEA', 14, 'DEN', 17],
  ['CIN', 21, 'BAL', 28],
  ['PHI', 24, 'WAS', 17],
  ['CAR', 13, 'TB', 20],
];

// Games that haven't kicked off: lineup advice treats their players as still
// swappable. Only the ESPN team's GB players are in one, and ESPN supplies its
// own scores, so no expected total depends on these. [home, away]
export const UPCOMING_GAMES: [string, string][] = [['GB', 'CHI']];

export const SEASON = '2026';
export const WEEK = 6;
