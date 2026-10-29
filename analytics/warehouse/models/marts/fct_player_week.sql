{#-
  One row per player on each team each league week: his points, the slot he
  started in, and the slot the best lineup would have used him in.

  Incremental: a run rebuilds only the league weeks the loader has new
  matchups for, replacing each one whole (delete+insert on league and week),
  so a player who left a roster mid-week doesn't linger. After changing this
  model's logic, rebuild everything: dbt build --full-refresh -s fct_player_week
-#}
-- depends_on: {{ ref('stg_sleeper__matchups') }}
{{
    config(
        materialized='incremental',
        unique_key=['league_id', 'week'],
        incremental_strategy='delete+insert',
        on_schema_change='append_new_columns',
    )
}}

with player_weeks as (
    select * from {{ ref('int_player_weeks') }}
    {% if is_incremental() %}
    where (league_id, week) in (
        select league_id, week
        from {{ ref('stg_sleeper__matchups') }}
        where loaded_at > (select coalesce(max(loaded_at), '-infinity') from {{ this }})
    )
    {% endif %}
)

select
    player_weeks.team_key,
    player_weeks.league_id,
    player_weeks.season,
    player_weeks.week,
    player_weeks.season * 100 + player_weeks.week as week_key,
    player_weeks.roster_id,
    player_weeks.player_id,
    player_weeks.position,
    player_weeks.is_starter,
    player_weeks.lineup_slot,
    best.best_slot as best_lineup_slot,
    best.player_id is not null as is_in_best_lineup,
    player_weeks.points,
    player_weeks.loaded_at
from player_weeks
left join {{ ref('int_best_lineups') }} as best
    on best.team_key = player_weeks.team_key
    and best.week = player_weeks.week
    and best.player_id = player_weeks.player_id
