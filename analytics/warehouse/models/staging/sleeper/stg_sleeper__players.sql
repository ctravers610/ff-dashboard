-- Every NFL player Sleeper knows, as of the latest load. Team defenses are
-- players too, keyed by team abbreviation ("SF").
select
    player_id,
    full_name,
    position,
    fantasy_positions,
    nfl_team,
    status,
    is_active,
    injury_status,
    injury_body_part,
    age,
    years_exp,
    birth_date,
    depth_chart_position,
    depth_chart_order,
    search_rank,
    espn_id,
    yahoo_id,
    gsis_id,
    loaded_at as version_loaded_at
from {{ ref('stg_sleeper__player_versions') }}
where is_latest
