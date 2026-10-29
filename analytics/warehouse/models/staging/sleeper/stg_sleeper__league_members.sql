-- One row per user per league (GET /league/{id}/users).
with latest as (
    {{ latest_version(source('raw', 'sleeper_league_users'), ['league_id']) }}
)

select
    latest.league_id,
    member ->> 'user_id' as user_id,
    member ->> 'display_name' as display_name,
    nullif(member -> 'metadata' ->> 'team_name', '') as team_name,
    coalesce((member ->> 'is_owner')::boolean, false) as is_commissioner
from latest
cross join jsonb_array_elements(latest.payload) as member
