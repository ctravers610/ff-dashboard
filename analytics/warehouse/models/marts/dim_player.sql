-- One row per NFL player, as he is now. For what he was at a given time
-- (team, injury), see dim_player_history.
select
    player_id,
    full_name,
    position,
    nfl_team,
    status,
    is_active,
    injury_status,
    age,
    years_exp,
    birth_date,
    depth_chart_position,
    depth_chart_order,
    espn_id,
    yahoo_id,
    gsis_id
from {{ ref('stg_sleeper__players') }}
