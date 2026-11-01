import { describe, expect, it } from 'vitest';
import { arrangeWall, cardSpans, type WallCard } from './wallOrder';

const league = (key: string, chance: number | null, over = false) => ({ key, chance, over });
const keys = (cards: WallCard[]) => cards.map((c) => c.key);
const sizes = (cards: WallCard[]) => Object.fromEntries(cards.map((c) => [c.key, c.size]));

describe('arrangeWall', () => {
  it('puts the closest matchups first, whichever side of even they are on', () => {
    const cards = arrangeWall([league('a', 0.95), league('b', 0.3), league('c', 0.51), league('d', 0.08), league('e', 0.75)]);
    expect(keys(cards)).toEqual(['c', 'b', 'e', 'd', 'a']);
  });

  it('sizes a card by how much is still in doubt', () => {
    const cards = arrangeWall([league('win', 0.95), league('long', 0.08), league('toss', 0.51), league('fav', 0.7), league('dog', 0.2)]);
    expect(sizes(cards)).toEqual({ toss: 'focus', fav: 'regular', dog: 'regular', win: 'small', long: 'small' });
  });

  it('shrinks finished matchups and leagues with none, and puts them after live ones', () => {
    const cards = arrangeWall([league('bye', null), league('final', 0.5, true), league('cruising', 0.99)]);
    expect(keys(cards)).toEqual(['cruising', 'final', 'bye']);
    expect(sizes(cards)).toEqual({ bye: 'small', final: 'small', cruising: 'small' });
  });

  it('rearranges when the odds change', () => {
    const before = arrangeWall([league('a', 0.5), league('b', 0.95)]);
    expect(keys(before)).toEqual(['a', 'b']);
    // A touchdown each way: a is running away with it, and b has come back to even.
    const after = arrangeWall([league('a', 0.97), league('b', 0.5)], before);
    expect(keys(after)).toEqual(['b', 'a']);
    expect(sizes(after)).toEqual({ a: 'small', b: 'focus' });
  });

  it('keeps a card’s size until the odds are clearly past the line', () => {
    const small = arrangeWall([league('a', 0.91)]);
    expect(sizes(small).a).toBe('small');
    expect(sizes(arrangeWall([league('a', 0.89)], small)).a).toBe('small');
    expect(sizes(arrangeWall([league('a', 0.87)], small)).a).toBe('regular');

    const regular = arrangeWall([league('a', 0.85)]);
    expect(sizes(arrangeWall([league('a', 0.91)], regular)).a).toBe('regular');
    expect(sizes(arrangeWall([league('a', 0.93)], regular)).a).toBe('small');
  });

  it('keeps two cards of the same size in place until one is clearly closer', () => {
    const before = arrangeWall([league('a', 0.52), league('b', 0.46)]);
    expect(keys(before)).toEqual(['a', 'b']);
    expect(keys(arrangeWall([league('a', 0.53), league('b', 0.48)], before))).toEqual(['a', 'b']); // 3 vs 2 points from even
    expect(keys(arrangeWall([league('a', 0.56), league('b', 0.49)], before))).toEqual(['b', 'a']); // 6 vs 1
  });

  it('a finished game goes small however close it was', () => {
    const before = arrangeWall([league('a', 0.5), league('b', 0.7)]);
    expect(sizes(arrangeWall([league('a', 0.5, true), league('b', 0.7)], before))).toEqual({ a: 'small', b: 'regular' });
  });

  it('places a league it hasn’t seen before and forgets one that’s gone', () => {
    const before = arrangeWall([league('a', 0.7), league('gone', 0.5)]);
    const after = arrangeWall([league('a', 0.7), league('new', 0.5)], before);
    expect(keys(after)).toEqual(['new', 'a']);
  });
});

describe('cardSpans', () => {
  it('fills every row', () => {
    expect(cardSpans(1, 3)).toEqual([12]);
    expect(cardSpans(2, 3)).toEqual([6, 6]);
    expect(cardSpans(3, 3)).toEqual([4, 4, 4]);
    expect(cardSpans(4, 3)).toEqual([6, 6, 6, 6]);
    expect(cardSpans(5, 3)).toEqual([4, 4, 4, 6, 6]);
    expect(cardSpans(6, 3)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(cardSpans(3, 2)).toEqual([6, 6, 12]);
    expect(cardSpans(0, 3)).toEqual([]);
  });
});
