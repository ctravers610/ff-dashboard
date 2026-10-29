-- Every version of every player the loader has seen: a new row each time
-- anything about him changed on Sleeper (team, injury, even search rank).
-- dim_player_history keeps only the changes that matter.
select
    id as version_id,
    player_id,
    coalesce(
        payload ->> 'full_name',
        nullif(concat_ws(' ', payload ->> 'first_name', payload ->> 'last_name'), '')
    ) as full_name,
    payload ->> 'position' as position,
    payload -> 'fantasy_positions' as fantasy_positions,
    payload ->> 'team' as nfl_team,  -- null for free agents
    payload ->> 'status' as status,
    coalesce((payload ->> 'active')::boolean, false) as is_active,
    payload ->> 'injury_status' as injury_status,
    payload ->> 'injury_body_part' as injury_body_part,
    (payload ->> 'age')::int as age,
    (payload ->> 'years_exp')::int as years_exp,
    (payload ->> 'birth_date')::date as birth_date,
    payload ->> 'depth_chart_position' as depth_chart_position,
    (payload ->> 'depth_chart_order')::int as depth_chart_order,
    (payload ->> 'search_rank')::int as search_rank,
    -- Other platforms' ids, for joining ESPN and Yahoo data later.
    payload ->> 'espn_id' as espn_id,
    payload ->> 'yahoo_id' as yahoo_id,
    payload ->> 'gsis_id' as gsis_id,
    loaded_at,
    row_number() over (partition by player_id order by id desc) = 1 as is_latest
from {{ source('raw', 'sleeper_players') }}
