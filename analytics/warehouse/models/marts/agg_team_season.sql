-- One row per team per league season, regular season only: its record three
-- ways (head to head, against the median, all-play), the wins its scoring
-- earned and the luck that leaves, how close its lineups came to the best
-- possible, its waiver pickups, and where it finished.
with team_weeks as (
    select * from {{ ref('fct_team_week') }}
),

teams as (
    select * from {{ ref('dim_team') }}
),

leagues as (
    select * from {{ ref('dim_league') }}
),

moves as (
    select * from {{ ref('fct_transaction_moves') }}
),

regular_season as (
    select
        team_key,
        league_id,
        count(*)::int as weeks_played,
        (count(*) filter (where result is not null))::int as games,
        (count(*) filter (where result = 'win'))::int as wins,
        (count(*) filter (where result = 'loss'))::int as losses,
        (count(*) filter (where result = 'tie'))::int as ties,
        (count(*) filter (where median_result = 'win'))::int as median_wins,
        (count(*) filter (where median_result = 'loss'))::int as median_losses,
        (count(*) filter (where median_result = 'tie'))::int as median_ties,
        sum(all_play_wins)::int as all_play_wins,
        sum(all_play_losses)::int as all_play_losses,
        sum(all_play_ties)::int as all_play_ties,
        sum(points) as points_for,
        sum(opponent_points) filter (where result is not null) as points_against,
        sum(best_lineup_points) as best_lineup_points,
        sum(points_left_on_bench) as points_left_on_bench
    from team_weeks
    where is_final and not is_playoffs
    group by team_key, league_id
),

pickups as (
    -- Waiver claims and free-agent adds that went through (trades aren't pickups).
    select
        team_key,
        count(*)::int as pickups,
        coalesce(sum(waiver_bid), 0)::int as faab_spent,
        coalesce(sum(points_started), 0) as pickup_points_started
    from moves
    where
        action = 'add'
        and status = 'complete'
        and transaction_type in ('waiver', 'free_agent')
    group by team_key
),

scored as (
    select
        regular_season.*,
        leagues.league_lineage_id,
        leagues.season,
        leagues.teams,
        leagues.plays_median,
        teams.team_name,
        teams.manager_id,
        teams.manager_name,
        teams.is_mine,
        -- Each week's all-play share of a win, summed: what the scores earned.
        -- Unrounded here, so luck isn't computed from a rounded number.
        (regular_season.all_play_wins + 0.5 * regular_season.all_play_ties)
        / nullif(leagues.teams - 1, 0) as expected_wins
    from regular_season
    inner join leagues on leagues.league_id = regular_season.league_id
    inner join teams on teams.team_key = regular_season.team_key
)

select
    scored.team_key,
    scored.league_id,
    scored.league_lineage_id,
    scored.season,
    scored.team_name,
    scored.manager_id,
    scored.manager_name,
    scored.is_mine,
    scored.teams,
    scored.weeks_played,
    scored.games,
    scored.wins,
    scored.losses,
    scored.ties,
    case when scored.plays_median then scored.median_wins end as median_wins,
    case when scored.plays_median then scored.median_losses end as median_losses,
    case when scored.plays_median then scored.median_ties end as median_ties,
    scored.all_play_wins,
    scored.all_play_losses,
    scored.all_play_ties,
    round(scored.expected_wins, 4) as expected_wins,
    -- Head-to-head wins beyond (or short of) what the scoring earned.
    round(scored.wins + 0.5 * scored.ties - scored.expected_wins, 4) as luck,
    scored.points_for,
    scored.points_against,
    scored.points_left_on_bench,
    round(scored.points_for / nullif(scored.best_lineup_points, 0), 4) as lineup_efficiency,
    coalesce(pickups.pickups, 0) as pickups,
    coalesce(pickups.faab_spent, 0) as faab_spent,
    coalesce(pickups.pickup_points_started, 0) as pickup_points_started,
    -- Standings: total wins (head to head plus median), then points for.
    rank() over (
        partition by scored.league_id
        order by
            scored.wins + 0.5 * scored.ties
            + case when scored.plays_median then scored.median_wins + 0.5 * scored.median_ties else 0 end desc,
            scored.points_for desc
    )::int as regular_season_rank
from scored
left join pickups on pickups.team_key = scored.team_key
