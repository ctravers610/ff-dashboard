-- Starting slots left empty: Sleeper marks them with player "0" in starters.
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
    s.starter_index::int as starter_index
from teams
cross join
    jsonb_array_elements_text({{ jsonb_array("teams.team -> 'starters'") }})
    with ordinality as s (player_id, starter_index)
where s.player_id = '0'
