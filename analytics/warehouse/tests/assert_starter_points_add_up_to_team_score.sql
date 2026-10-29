-- A team's score is its starters' points. Any row here is a team week where
-- they disagree, which would mean matchup_players lost or doubled a player.
-- Commissioner-overridden scores (custom_points) are left out.
with starters as (
    select league_id, week, roster_id, sum(points) as starter_points
    from {{ ref('stg_sleeper__matchup_players') }}
    where is_starter
    group by 1, 2, 3
)

select
    matchups.league_id,
    matchups.week,
    matchups.roster_id,
    matchups.points,
    coalesce(starters.starter_points, 0) as starter_points
from {{ ref('stg_sleeper__matchups') }} as matchups
left join starters using (league_id, week, roster_id)
where matchups.custom_points is null
  and abs(matchups.points - coalesce(starters.starter_points, 0)) > 0.01
