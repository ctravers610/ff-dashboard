-- One row per player on each team's roster each league week: starters and bench,
-- with the points he scored. starter_index is his place in the starting lineup
-- (1-based), in the same order as the league's roster_positions.
with latest as (
    {{ latest_version(source('raw', 'sleeper_matchups'), ['league_id', 'week']) }}
),

teams as (
    select latest.league_id, latest.week, team
    from latest
    cross join jsonb_array_elements(latest.payload) as team
)

select
    teams.league_id,
    teams.week,
    (teams.team ->> 'roster_id')::int as roster_id,
    player.player_id,
    starter.starter_index is not null as is_starter,
    starter.starter_index::int as starter_index,
    coalesce((teams.team -> 'players_points' ->> player.player_id)::numeric, 0) as points
from teams
cross join jsonb_array_elements_text({{ jsonb_array("teams.team -> 'players'") }}) as player (player_id)
left join lateral (
    select s.starter_index
    from jsonb_array_elements_text({{ jsonb_array("teams.team -> 'starters'") }})
        with ordinality as s (player_id, starter_index)
    where s.player_id = player.player_id
) as starter on true
