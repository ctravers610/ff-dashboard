import type { FfpcWeekPasted, FfpcWeeksPasted } from '@ffd/shared';
import { useQuery } from '@tanstack/react-query';
import { api, useDemo } from '../../api';
import { FfpcPageBox } from '../FfpcPageBox';

const notice = (p: FfpcWeekPasted) =>
  p.points != null
    ? `Week ${p.week} is in History: ${p.teamName} ${p.points.toFixed(2)}, ${p.opponentName} ${(p.opponentPoints ?? 0).toFixed(2)}.`
    : `Saved week ${p.week}: ${p.teamName} vs ${p.opponentName}. It goes into History once the week is over and its stats are in.`;

// Old weeks of an FFPC league, from copies of their Live Scoring pages. Named
// when it isn't under that league's own results.
export function FfpcWeekPaste({ leagueId, leagueName }: { leagueId: string; leagueName?: string }) {
  const url = `/api/manual-leagues/${leagueId}/history`;
  const queryKey = ['ffpc-weeks', leagueId];
  const demo = useDemo();
  const { data } = useQuery({ queryKey, queryFn: () => api<FfpcWeeksPasted>(url), enabled: !demo });
  const weeks = data?.weeks ?? [];

  return (
    <FfpcPageBox<FfpcWeekPasted>
      url={url}
      status={`${leagueName ? `${leagueName}: ` : ''}${weeks.length ? `Weeks pasted so far: ${weeks.join(', ')}.` : 'No weeks pasted yet.'}`}
      openLabel="Paste an old week"
      help="In FFPC, open a finished week's Live Scoring page, press Ctrl+A then Ctrl+C, and paste here. Your roster and this week's matchup don't change."
      placeholder="Paste a finished week's Live Scoring page here"
      refresh={[queryKey, ['history'], ['recap']]}
      pastedNotice={notice}
    />
  );
}
