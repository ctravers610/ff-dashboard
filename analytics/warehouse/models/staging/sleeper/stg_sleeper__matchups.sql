-- One row per team per league week. The two teams in a game share a matchup_id;
-- it's null for a team without a game that week.
with latest as (
    {{ latest_version(source('raw', 'sleeper_matchups'), ['league_id', 'week']) }}
)

select
    latest.league_id,
    latest.week,
    (team ->> 'roster_id')::int as roster_id,
    (team ->> 'matchup_id')::int as matchup_id,
    (team ->> 'points')::numeric as points,
    (team ->> 'custom_points')::numeric as custom_points,  -- set when the commissioner overrides the score
    latest.loaded_at
from latest
cross join jsonb_array_elements(latest.payload) as team
