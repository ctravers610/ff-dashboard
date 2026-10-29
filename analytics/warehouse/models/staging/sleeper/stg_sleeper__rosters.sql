-- One row per roster (team) per league, as it stands now. Records and points
-- are season totals so far.
with latest as (
    {{ latest_version(source('raw', 'sleeper_rosters'), ['league_id']) }}
),

rosters as (
    select latest.league_id, roster
    from latest
    cross join jsonb_array_elements(latest.payload) as roster
)

select
    league_id,
    (roster ->> 'roster_id')::int as roster_id,
    roster ->> 'owner_id' as owner_user_id,
    {{ jsonb_array("roster -> 'co_owners'") }} as co_owner_user_ids,
    (roster -> 'settings' ->> 'wins')::int as wins,
    (roster -> 'settings' ->> 'losses')::int as losses,
    (roster -> 'settings' ->> 'ties')::int as ties,
    -- Sleeper splits points into whole points and hundredths.
    coalesce((roster -> 'settings' ->> 'fpts')::numeric, 0)
    + coalesce((roster -> 'settings' ->> 'fpts_decimal')::numeric, 0) / 100 as points_for,
    coalesce((roster -> 'settings' ->> 'fpts_against')::numeric, 0)
    + coalesce((roster -> 'settings' ->> 'fpts_against_decimal')::numeric, 0) / 100 as points_against,
    coalesce((roster -> 'settings' ->> 'ppts')::numeric, 0)
    + coalesce((roster -> 'settings' ->> 'ppts_decimal')::numeric, 0) / 100 as potential_points,
    (roster -> 'settings' ->> 'waiver_position')::int as waiver_position,
    (roster -> 'settings' ->> 'waiver_budget_used')::int as waiver_budget_used,
    (roster -> 'settings' ->> 'total_moves')::int as total_moves,
    roster -> 'metadata' ->> 'record' as results  -- e.g. "WWLWL", oldest first
from rosters
