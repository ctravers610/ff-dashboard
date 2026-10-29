-- Every NFL player Sleeper knows, as of the latest load. Team defenses are
-- players too, keyed by team abbreviation ("SF").
select
    {{ dbt_utils.star(from=ref('stg_sleeper__player_versions'), except=['version_id', 'loaded_at', 'is_latest']) }},
    loaded_at as version_loaded_at
from {{ ref('stg_sleeper__player_versions') }}
where is_latest
