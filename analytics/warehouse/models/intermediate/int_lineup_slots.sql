-- Each league's starting lineup, one row per slot. slot_index counts starting
-- slots only, in Sleeper's order, so it matches matchup_players.starter_index.
with leagues as (
    select * from {{ ref('stg_sleeper__leagues') }}
),

slots as (
    select
        leagues.league_id,
        slots.slot,
        slots.position_index
    from leagues
    cross join
        jsonb_array_elements_text({{ jsonb_array('leagues.roster_positions') }})
        with ordinality as slots (slot, position_index)
    where slots.slot not in ('BN', 'IR', 'TAXI')
)

select
    league_id,
    row_number() over (partition by league_id order by position_index)::int as slot_index,
    slot
from slots
