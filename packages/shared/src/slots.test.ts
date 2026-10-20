import { describe, expect, it } from 'vitest';
import { unfilledSlots } from './slots';

describe('unfilledSlots', () => {
  const lineup = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

  it('is empty when every slot can be filled', () => {
    expect(unfilledSlots(lineup, ['QB', 'RB', 'RB', 'RB', 'WR', 'WR', 'TE', 'K', 'DEF'])).toEqual([]);
  });

  it('names the slots left open', () => {
    expect(unfilledSlots(lineup, ['QB', 'RB', 'WR', 'WR', 'WR', 'TE', 'K', 'DEF'])).toEqual(['RB']);
  });

  it('never spends a flexible player on a slot another player could fill', () => {
    // Taken in order, the TE would go to FLEX first and leave TE open.
    expect(unfilledSlots(['FLEX', 'TE'], ['TE', 'WR'])).toEqual([]);
  });
});
