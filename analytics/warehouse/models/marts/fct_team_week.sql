-- One row per team per league week: the score, the result, how it ranked
-- against the whole league (all-play), and the best lineup it could have set.
with weeks as (
    select * from {{ ref('int_matchups_paired') }}
),

leagues as (
    select * from {{ ref('dim_league') }}
),

nfl_state as (
    select * from {{ ref('stg_sleeper__nfl_state') }}
),

teams as (
    select * from {{ ref('dim_team') }}
),

best_lineups as (
    select team_key, week, sum(points) as best_lineup_points
    from {{ ref('int_best_lineups') }}
    group by 1, 2
),

medians as (
    select
        league_id,
        week,
        percentile_cont(0.5) within group (order by points)::numeric as league_median_points
    from weeks
    group by 1, 2
),

scored as (
    select
        weeks.*,
        leagues.season,
        leagues.plays_median,
        weeks.week >= leagues.playoff_week_start as is_playoffs,
        -- A week is final once it's over: the league is finished, it's an
        -- earlier season, or it's before the current NFL week.
        leagues.status = 'complete'
        or leagues.season < nfl_state.season
        or weeks.week < nfl_state.week as is_final,
        medians.league_median_points
    from weeks
    inner join leagues on leagues.league_id = weeks.league_id
    inner join medians on medians.league_id = weeks.league_id and medians.week = weeks.week
    cross join nfl_state
),

ranked as (
    select
        scored.*,
        -- All-play: this score against every other team's that week.
        (rank() over (partition by scored.league_id, scored.week order by scored.points) - 1)::int as teams_outscored,
        (count(*) over (partition by scored.league_id, scored.week, scored.points) - 1)::int as teams_tied,
        (count(*) over (partition by scored.league_id, scored.week) - 1)::int as other_teams
    from scored
)

select
    {{ dbt_utils.generate_surrogate_key(['ranked.league_id', 'ranked.roster_id']) }} as team_key,
    case
        when ranked.opponent_roster_id is not null then
            {{ dbt_utils.generate_surrogate_key(['ranked.league_id', 'ranked.opponent_roster_id']) }}
    end as opponent_team_key,
    ranked.league_id,
    ranked.season,
    ranked.week,
    ranked.season * 100 + ranked.week as week_key,
    ranked.roster_id,
    ranked.matchup_id,
    ranked.is_playoffs,
    ranked.is_final,
    teams.is_mine,

    ranked.points,
    ranked.opponent_points,
    ranked.points - ranked.opponent_points as margin,
    case
        when not ranked.is_final or ranked.opponent_roster_id is null then null
        when ranked.points > ranked.opponent_points then 'win'
        when ranked.points < ranked.opponent_points then 'loss'
        else 'tie'
    end as result,
    -- Leagues that also play the median: a second result each week.
    case
        when not ranked.plays_median or not ranked.is_final then null
        when ranked.points > ranked.league_median_points then 'win'
        when ranked.points < ranked.league_median_points then 'loss'
        else 'tie'
    end as median_result,
    ranked.league_median_points,

    case when ranked.is_final then ranked.teams_outscored end as all_play_wins,
    case when ranked.is_final then ranked.teams_tied end as all_play_ties,
    case
        when ranked.is_final then ranked.other_teams - ranked.teams_outscored - ranked.teams_tied
    end as all_play_losses,

    best_lineups.best_lineup_points,
    greatest(0, best_lineups.best_lineup_points - ranked.points) as points_left_on_bench
from ranked
left join best_lineups
    on
        best_lineups.team_key = {{ dbt_utils.generate_surrogate_key(['ranked.league_id', 'ranked.roster_id']) }}
        and best_lineups.week = ranked.week
left join teams
    on
        teams.league_id = ranked.league_id
        and teams.roster_id = ranked.roster_id
