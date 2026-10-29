-- One row per NFL regular-season week. A week runs Tuesday to Monday, the way
-- fantasy weeks do: waivers early in the week, games Thursday to Monday night.
with seasons as (
    select * from {{ ref('nfl_seasons') }}
),

weeks as (
    select
        seasons.season,
        week::int as week,
        seasons.regular_season_weeks,
        -- The Tuesday of opening week (kickoff is Thursday, or Wednesday in 2026).
        (date_trunc('week', seasons.kickoff_date)::date + 1 + 7 * (week - 1)) as starts_on
    from seasons
    cross join generate_series(1, seasons.regular_season_weeks) as week
)

select
    season * 100 + week as week_key,  -- 202608: season 2026, week 8
    season,
    week,
    starts_on,
    starts_on + 6 as ends_on,
    week = regular_season_weeks as is_last_week
from weeks
