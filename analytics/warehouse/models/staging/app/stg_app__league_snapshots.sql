-- The app's History: your result in each league each week, on every platform.
with latest as (
    {{ latest_version(source('raw', 'app_league_snapshots'), ['platform', 'league_id', 'season', 'week']) }}
)

select
    platform,
    league_id,
    payload ->> 'league_name' as league_name,
    season::int as season,
    week,
    (payload ->> 'points')::numeric as points,
    (payload ->> 'projected')::numeric as projected,
    payload ->> 'opponent_name' as opponent_name,
    (payload ->> 'opponent_points')::numeric as opponent_points,
    (payload ->> 'opponent_projected')::numeric as opponent_projected,
    -- All-play weeks: the top all_play_win_slots of all_play_teams win.
    (payload ->> 'all_play_rank')::int as all_play_rank,
    (payload ->> 'all_play_teams')::int as all_play_teams,
    (payload ->> 'all_play_win_slots')::int as all_play_win_slots,
    (payload ->> 'wins')::int as wins,
    (payload ->> 'losses')::int as losses,
    (payload ->> 'ties')::int as ties,
    (payload ->> 'standing_rank')::int as standing_rank,
    (payload ->> 'standing_teams')::int as standing_teams,
    (payload ->> 'captured_at')::timestamptz as captured_at
from latest
