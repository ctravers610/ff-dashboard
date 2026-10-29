{#-
  The app's live scoring feed, one row per scoring change per league it
  counted in, on every platform. Incremental: each run adds only events newer
  than the last one here, since events never change once recorded.
-#}
{{
    config(
        materialized='incremental',
        unique_key=['event_id', 'league_key'],
        incremental_strategy='delete+insert',
        on_schema_change='append_new_columns',
    )
}}

select
    event_id,
    season,
    week,
    season * 100 + week as week_key,
    occurred_at,
    platform,
    league_key,
    league_name,
    player_id,
    player_name,
    position,
    nfl_team,
    description,
    role,
    points
from {{ ref('stg_app__live_event_scores') }}
{% if is_incremental() %}
    where event_id > (select coalesce(max(existing.event_id), 0) from {{ this }} as existing)
{% endif %}
