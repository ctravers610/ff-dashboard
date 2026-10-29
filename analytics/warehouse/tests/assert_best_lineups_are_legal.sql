-- Every best lineup must be one the team could have set: no slot used more
-- often than the league has it, and every player in a slot he can play.
-- Rows here are team weeks that break a rule.
{%- set flex = flex_slots() %}

with picks as (
    select league_id, week, roster_id, player_id, position, best_slot
    from {{ ref('int_best_lineups') }}
),

slot_counts as (
    select league_id, slot, count(*) as slots
    from {{ ref('int_lineup_slots') }}
    group by 1, 2
),

overfilled as (
    select picks.league_id, picks.week, picks.roster_id, picks.best_slot, 'more players than slots' as problem
    from picks
    left join slot_counts
        on slot_counts.league_id = picks.league_id
        and slot_counts.slot = picks.best_slot
    group by 1, 2, 3, 4, slot_counts.slots
    having count(*) > coalesce(slot_counts.slots, 0)
),

ineligible as (
    select league_id, week, roster_id, best_slot, 'player cannot play this slot' as problem
    from picks
    where case best_slot
        {%- for rule in flex %}
        when '{{ rule.slot }}' then position not in ('{{ rule.positions | join("', '") }}')
        {%- endfor %}
        else position is distinct from best_slot
    end
),

reused as (
    select league_id, week, roster_id, null as best_slot, 'player used twice' as problem
    from picks
    group by league_id, week, roster_id, player_id
    having count(*) > 1
)

select * from overfilled
union all
select * from ineligible
union all
select * from reused
