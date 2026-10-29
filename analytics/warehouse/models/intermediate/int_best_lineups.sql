{#-
  The highest-scoring legal lineup each team could have fielded each week, in
  hindsight: one row per player it would have started. Filled the way the
  app's Lineup Recap does it, so the two agree:

  1. Slots that take one position (QB, RB, WR, TE, K, DEF): the top scorers
     at that position, as many as the league has slots.
  2. Then each multi-position slot, narrowest first (see flex_slots()): the
     top scorers left who can play there.

  With nested slot rules like Sleeper's, that greedy order is the true best.
-#}
{%- set flex = flex_slots() -%}
{%- set flex_names = flex | map(attribute='slot') | list -%}

with players as (
    select team_key, league_id, week, roster_id, player_id, position, points
    from {{ ref('int_player_weeks') }}
),

slot_counts as (
    select league_id, slot, count(*) as slots
    from {{ ref('int_lineup_slots') }}
    group by 1, 2
),

single_position as (
    select
        ranked.team_key, ranked.league_id, ranked.week, ranked.roster_id,
        ranked.player_id, ranked.position, ranked.points,
        ranked.position as best_slot
    from (
        select
            players.*,
            row_number() over (
                partition by players.team_key, players.week, players.position
                order by players.points desc, players.player_id asc
            ) as position_rank
        from players
    ) as ranked
    inner join slot_counts
        on
            slot_counts.league_id = ranked.league_id
            and slot_counts.slot = ranked.position
    where
        ranked.position_rank <= slot_counts.slots
        and slot_counts.slot not in ({{ sql_list(flex_names) }})
),

picked_0 as (
    select * from single_position
),

-- The loop writes top-level CTEs, so they aren't indented under it.
-- noqa: disable=LT02
{% for rule in flex %}
-- {{ rule.slot }}: the best {{ rule.positions | join('/') }} left.
filled_{{ loop.index }} as (
    select
        ranked.team_key, ranked.league_id, ranked.week, ranked.roster_id,
        ranked.player_id, ranked.position, ranked.points,
        '{{ rule.slot }}' as best_slot
    from (
        select
            players.*,
            row_number() over (
                partition by players.team_key, players.week
                order by players.points desc, players.player_id asc
            ) as slot_rank
        from players
        where
            players.position in ({{ sql_list(rule.positions) }})
            and not exists (
                select 1
                from picked_{{ loop.index0 }} as picked
                where
                    picked.team_key = players.team_key
                    and picked.week = players.week
                    and picked.player_id = players.player_id
            )
    ) as ranked
    inner join slot_counts
        on
            slot_counts.league_id = ranked.league_id
            and slot_counts.slot = '{{ rule.slot }}'
    where ranked.slot_rank <= slot_counts.slots
),

picked_{{ loop.index }} as (
    select * from picked_{{ loop.index0 }}
    union all
    select * from filled_{{ loop.index }}
){{ "," if not loop.last }}
{% endfor %}
-- noqa: enable=LT02

select * from picked_{{ flex | length }}
