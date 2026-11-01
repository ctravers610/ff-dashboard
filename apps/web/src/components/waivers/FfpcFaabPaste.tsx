import type { FfpcFaabPasted, FfpcFaabWeeks } from '@ffd/shared';
import { useQuery } from '@tanstack/react-query';
import { api, useDemo } from '../../api';
import { FfpcPageBox } from '../FfpcPageBox';

const claims = (n: number) => `${n} ${n === 1 ? 'claim' : 'claims'}`;

const notice = (p: FfpcFaabPasted) =>
  p.added > 0
    ? `Added ${p.added} new ${p.added === 1 ? 'claim' : 'claims'} from week ${p.weeks.join(', ')}, for bid recommendations.`
    : `Nothing new: the ${claims(p.claims)} from week ${p.weeks.join(', ')} ${p.claims === 1 ? 'was' : 'were'} already here.`;

// What an FFPC league's bids have cost, from copies of its FAAB Report, for the
// bid recommendations. FFPC only learns from FFPC, so these are what price it.
export function FfpcFaabPaste({ leagueId }: { leagueId: string }) {
  const url = `/api/manual-leagues/${leagueId}/faab`;
  const queryKey = ['ffpc-faab', leagueId];
  const demo = useDemo();
  const { data } = useQuery({ queryKey, queryFn: () => api<FfpcFaabWeeks>(url), enabled: !demo });
  const weeks = data?.weeks ?? [];

  return (
    <FfpcPageBox<FfpcFaabPasted>
      url={url}
      status={
        weeks.length
          ? `FAAB Reports so far: ${weeks.map((w) => `week ${w.week} (${claims(w.claims)})`).join(', ')}.`
          : "Bid recommendations learn from FFPC's FAAB Reports. None pasted yet."
      }
      openLabel="Add a FAAB Report"
      help="In FFPC, open a week of this league's FAAB Report, press Ctrl+A then Ctrl+C, and paste here. Pasting a report again only adds what's new."
      placeholder="Paste FFPC's FAAB Report here"
      refresh={[queryKey, ['waivers']]}
      pastedNotice={notice}
    />
  );
}
