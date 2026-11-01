// How the home page's cards rank and size themselves as the odds move: the closest
// matchups first and biggest, the ones already settled last and smallest. Odds move
// a little with every play, so a card has to clear a threshold by a small margin to
// change, or one sitting on the line would bounce back and forth all game.

export type CardSize = 'focus' | 'regular' | 'small';

export interface WallLeague {
  key: string;
  chance: number | null; // null: no matchup to judge
  over: boolean; // every game that matters is final
}

export interface WallCard {
  key: string;
  size: CardSize;
}

const SIZE_MARGIN = 0.02; // how far past a threshold a card goes before it changes size
const RANK_MARGIN = 0.03; // how much closer a card has to be to pass another of its size
const SIZE_ORDER: Record<CardSize, number> = { focus: 0, regular: 1, small: 2 };

// The same lines as the words on the cards: Toss-up gets the focus; Cruising, Long
// shot and finished matchups give way.
function sizeAt(chance: number): CardSize {
  if (chance >= 0.9 || chance < 0.1) return 'small';
  return chance >= 0.4 && chance < 0.6 ? 'focus' : 'regular';
}

function sizeFor({ chance, over }: WallLeague, before: CardSize | undefined): CardSize {
  if (chance == null || over) return 'small';
  const near = [chance - SIZE_MARGIN, chance, chance + SIZE_MARGIN].map(sizeAt);
  return before && near.includes(before) ? before : sizeAt(chance);
}

// Lower is closer. A finished game is past any live one, and no matchup is last.
function distance({ chance, over }: WallLeague): number {
  if (chance == null) return 2;
  return over ? 1 : Math.abs(chance - 0.5);
}

/** The wall's cards in the order to show them, given how they were arranged last time (nothing, on first load). */
export function arrangeWall(leagues: WallLeague[], previous: WallCard[] = []): WallCard[] {
  const before = new Map(previous.map((card, i) => [card.key, { size: card.size, i }]));
  const margin = previous.length ? RANK_MARGIN : 0;
  // Start from the last arrangement, so cards only move for a real change.
  const start = [...leagues].sort((a, b) => (before.get(a.key)?.i ?? leagues.length) - (before.get(b.key)?.i ?? leagues.length));
  const placed: { league: WallLeague; size: CardSize }[] = [];
  for (const league of start) {
    const size = sizeFor(league, before.get(league.key)?.size);
    let at = placed.length;
    while (at > 0) {
      const ahead = placed[at - 1]!;
      const bySize = SIZE_ORDER[size] - SIZE_ORDER[ahead.size];
      if (bySize > 0 || (bySize === 0 && distance(league) + margin >= distance(ahead.league))) break;
      at--;
    }
    placed.splice(at, 0, { league, size });
  }
  return placed.map(({ league, size }) => ({ key: league.key, size }));
}

/**
 * How wide to make each of a size's cards, in twelfths, with at most `across` to a
 * row. Whatever's left over shares the last row, so no row ends in a gap.
 */
export function cardSpans(count: number, across: number): number[] {
  const perRow = count === 4 && across === 3 ? 2 : across; // two rows of two, not three and a straggler
  const left = count % perRow;
  return Array.from({ length: count }, (_, i) => 12 / (i >= count - left ? left : perRow));
}
