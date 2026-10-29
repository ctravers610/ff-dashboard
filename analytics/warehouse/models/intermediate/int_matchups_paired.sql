-- Each team's week next to its opponent's: the two rows that share a matchup_id.
with matchups as (
    select
        league_id,
        week,
        roster_id,
        matchup_id,
        coalesce(custom_points, points) as points  -- a commissioner's override wins
    from {{ ref('stg_sleeper__matchups') }}
)

select
    team.league_id,
    team.week,
    team.roster_id,
    team.matchup_id,
    team.points,
    opponent.roster_id as opponent_roster_id,
    opponent.points as opponent_points
from matchups as team
left join matchups as opponent
    on
        opponent.league_id = team.league_id
        and opponent.week = team.week
        and opponent.matchup_id = team.matchup_id
        and opponent.roster_id <> team.roster_id
