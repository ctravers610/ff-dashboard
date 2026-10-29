-- The live feed, one row per scoring change per league it counted in.
with latest as (
    {{ latest_version(source('raw', 'app_live_events'), ['event_id']) }}
)

select
    latest.event_id,
    (latest.payload ->> 'season')::int as season,
    (latest.payload ->> 'week')::int as week,
    (latest.payload ->> 'at')::timestamptz as occurred_at,
    latest.payload -> 'event' -> 'player' ->> 'playerId' as player_id,
    latest.payload -> 'event' -> 'player' ->> 'name' as player_name,
    latest.payload -> 'event' -> 'player' ->> 'position' as position,
    latest.payload -> 'event' -> 'player' ->> 'nflTeam' as nfl_team,
    latest.payload -> 'event' ->> 'description' as description,  -- e.g. "1 sack"
    league ->> 'platform' as platform,
    league ->> 'leagueKey' as league_key,
    league ->> 'leagueName' as league_name,
    league ->> 'role' as role,  -- starter, bench, or opponent (starting against you)
    (league ->> 'points')::numeric as points
from latest
cross join jsonb_array_elements({{ jsonb_array("latest.payload -> 'event' -> 'leagues'") }}) as league
