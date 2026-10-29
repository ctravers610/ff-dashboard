-- The two teams in a game must have opposite results and margins: one's win is
-- the other's loss. Rows here are games where they disagree.
select
    team.league_id,
    team.week,
    team.roster_id,
    team.result,
    opponent.result as opponent_result
from {{ ref('fct_team_week') }} as team
inner join {{ ref('fct_team_week') }} as opponent
    on opponent.team_key = team.opponent_team_key
    and opponent.week = team.week
where team.opponent_team_key is not null
  and (
      opponent.opponent_team_key is distinct from team.team_key
      or team.margin <> -opponent.margin
      or team.result is distinct from case opponent.result
          when 'win' then 'loss'
          when 'loss' then 'win'
          else opponent.result
      end
  )
