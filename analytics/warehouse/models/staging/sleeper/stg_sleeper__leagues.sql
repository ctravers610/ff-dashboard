with latest as (
    {{ latest_version(source('raw', 'sleeper_leagues'), ['league_id']) }}
)

select
    league_id,
    (payload ->> 'season')::int as season,
    payload ->> 'name' as league_name,
    payload ->> 'status' as status,
    (payload ->> 'total_rosters')::int as total_rosters,
    nullif(payload ->> 'previous_league_id', '0') as previous_league_id,
    payload ->> 'draft_id' as draft_id,

    (payload -> 'settings' ->> 'start_week')::int as start_week,
    (payload -> 'settings' ->> 'playoff_week_start')::int as playoff_week_start,
    (payload -> 'settings' ->> 'playoff_teams')::int as playoff_teams,
    (payload -> 'settings' ->> 'trade_deadline')::int as trade_deadline_week,
    -- Each week also plays the league median (a second result per week).
    coalesce((payload -> 'settings' ->> 'league_average_match')::int = 1, false) as plays_median,
    case (payload -> 'settings' ->> 'waiver_type')::int
        when 0 then 'rolling'
        when 1 then 'reverse_standings'
        when 2 then 'faab'
    end as waiver_type,
    (payload -> 'settings' ->> 'waiver_budget')::int as waiver_budget,
    case (payload -> 'settings' ->> 'type')::int
        when 0 then 'redraft'
        when 1 then 'keeper'
        when 2 then 'dynasty'
    end as league_type,
    coalesce((payload -> 'settings' ->> 'best_ball')::int = 1, false) as is_best_ball,

    payload -> 'roster_positions' as roster_positions,  -- one entry per slot: QB, RB, FLEX, BN, ...
    payload -> 'scoring_settings' as scoring_settings,  -- stat → points per unit
    (payload -> 'scoring_settings' ->> 'rec')::numeric as points_per_reception
from latest
