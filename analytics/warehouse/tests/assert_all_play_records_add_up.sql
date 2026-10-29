-- In a final week, each team's all-play record covers every other team in the
-- league exactly once. Rows here are team weeks where it doesn't.
select
    weeks.league_id,
    weeks.week,
    weeks.roster_id,
    weeks.all_play_wins + weeks.all_play_ties + weeks.all_play_losses as all_play_games,
    leagues.teams - 1 as other_teams
from {{ ref('fct_team_week') }} as weeks
inner join {{ ref('dim_league') }} as leagues on leagues.league_id = weeks.league_id
where weeks.is_final
  and weeks.all_play_wins + weeks.all_play_ties + weeks.all_play_losses is distinct from leagues.teams - 1
