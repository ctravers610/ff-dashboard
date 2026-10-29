with latest as (
    {{ latest_version(source('raw', 'sleeper_state'), []) }}
)

select
    (payload ->> 'league_season')::int as season,
    (payload ->> 'week')::int as week,
    (payload ->> 'display_week')::int as display_week,
    payload ->> 'season_type' as season_type,
    (payload ->> 'season_start_date')::date as season_start_date,
    loaded_at
from latest
