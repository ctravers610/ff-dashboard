-- Every player on every team each league week, with the slot he started in.
with player_weeks as (
    select * from {{ ref('stg_sleeper__matchup_players') }}
),

leagues as (
    select * from {{ ref('stg_sleeper__leagues') }}
),

players as (
    select * from {{ ref('stg_sleeper__players') }}
),

slots as (
    select * from {{ ref('int_lineup_slots') }}
)

select
    {{ dbt_utils.generate_surrogate_key(['player_weeks.league_id', 'player_weeks.roster_id']) }} as team_key,
    player_weeks.league_id,
    leagues.season,
    player_weeks.week,
    player_weeks.roster_id,
    player_weeks.player_id,
    -- His Sleeper position now; lineup rules use this one position, as the app does.
    players.position,
    player_weeks.is_starter,
    slots.slot as lineup_slot,
    player_weeks.points,
    player_weeks.loaded_at
from player_weeks
inner join leagues
    on leagues.league_id = player_weeks.league_id
left join players
    on players.player_id = player_weeks.player_id
left join slots
    on
        slots.league_id = player_weeks.league_id
        and slots.slot_index = player_weeks.starter_index
