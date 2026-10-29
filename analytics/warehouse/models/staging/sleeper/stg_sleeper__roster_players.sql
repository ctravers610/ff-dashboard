-- One row per player on each roster now, with where he sits.
with latest as (
    {{ latest_version(source('raw', 'sleeper_rosters'), ['league_id']) }}
),

rosters as (
    select latest.league_id, roster
    from latest
    cross join jsonb_array_elements(latest.payload) as roster
)

select
    rosters.league_id,
    (rosters.roster ->> 'roster_id')::int as roster_id,
    player.player_id,
    case
        when {{ jsonb_array("rosters.roster -> 'reserve'") }} ? player.player_id then 'reserve'
        when {{ jsonb_array("rosters.roster -> 'taxi'") }} ? player.player_id then 'taxi'
        when {{ jsonb_array("rosters.roster -> 'starters'") }} ? player.player_id then 'starter'
        else 'bench'
    end as slot
from rosters
cross join jsonb_array_elements_text({{ jsonb_array("rosters.roster -> 'players'") }}) as player (player_id)
