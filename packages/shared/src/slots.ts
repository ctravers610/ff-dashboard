// Which positions each lineup slot accepts, across Sleeper, ESPN and FFPC slot
// names, and whether a set of players can fill a lineup.

const FLEX = ['RB', 'WR', 'TE'];
const SUPERFLEX = ['QB', 'RB', 'WR', 'TE'];
const DEFENSE = ['DEF', 'D/ST'];
const ELIGIBLE: Record<string, string[]> = {
  FLEX,
  'W/R/T': FLEX,
  'RB/WR': ['RB', 'WR'],
  WRRB_FLEX: ['RB', 'WR'],
  'WR/TE': ['WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: SUPERFLEX,
  SUPERFLEX,
  OP: SUPERFLEX,
  DEF: DEFENSE,
  'D/ST': DEFENSE,
};

/** A slot not listed above accepts only the position of the same name. */
export const canPlay = (slot: string, position: string) => (ELIGIBLE[slot] ?? [slot]).includes(position);

/**
 * The slots that can't be filled from these players' positions, at most one
 * player per slot. Uses a full matching, so a flexible player is never spent on
 * a slot someone else could have taken.
 */
export function unfilledSlots(slots: string[], positions: string[]): string[] {
  const holder = new Array<number>(positions.length).fill(-1); // player -> slot
  const place = (slot: number, seen: Set<number>): boolean => {
    for (let p = 0; p < positions.length; p++) {
      if (seen.has(p) || !canPlay(slots[slot]!, positions[p]!)) continue;
      seen.add(p);
      if (holder[p] === -1 || place(holder[p]!, seen)) {
        holder[p] = slot;
        return true;
      }
    }
    return false;
  };
  return slots.filter((_, i) => !place(i, new Set()));
}
