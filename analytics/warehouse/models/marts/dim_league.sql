-- One row per league per season. Sleeper gives a league a new id each season
-- it renews, chained by previous_league_id; league_lineage_id follows that
-- chain back to the first season loaded, so one league's history groups together.
with recursive leagues as (
    select * from {{ ref('stg_sleeper__leagues') }}
),

lineage as (
    -- Seasons with no earlier season loaded start a lineage...
    select league_id, league_id as league_lineage_id, 1 as season_number
    from leagues
    where previous_league_id is null
       or previous_league_id not in (select league_id from leagues)

    union all

    -- ...and each renewal continues it.
    select leagues.league_id, lineage.league_lineage_id, lineage.season_number + 1
    from leagues
    inner join lineage on leagues.previous_league_id = lineage.league_id
),

starting_slots as (
    select league_id, count(*) as starting_slots
    from {{ ref('int_lineup_slots') }}
    group by 1
)

select
    leagues.league_id,
    'sleeper' as platform,
    leagues.season,
    leagues.league_name,
    lineage.league_lineage_id,
    lineage.season_number,  -- 1 for the first season loaded
    leagues.status,
    leagues.league_type,
    leagues.total_rosters as teams,
    starting_slots.starting_slots,
    leagues.roster_positions ? 'SUPER_FLEX' as is_superflex,
    leagues.points_per_reception,
    leagues.plays_median,
    leagues.waiver_type,
    leagues.waiver_budget,
    leagues.playoff_week_start,
    leagues.playoff_teams,
    leagues.trade_deadline_week,
    leagues.is_best_ball
from leagues
inner join lineage on lineage.league_id = leagues.league_id
left join starting_slots on starting_slots.league_id = leagues.league_id
