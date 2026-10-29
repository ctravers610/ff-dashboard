{#-
  Slowly changing dimension (type 2): one row per stretch of time a player's
  team, position, status and injury stayed the same, with valid_from and
  valid_to. Built from the raw versions, which already keep every change the
  loader saw. Most versions change only fields that don't matter here (news
  time, search rank), so consecutive versions with the same tracked values
  are merged into one row (gaps and islands).

  History starts when the loader first ran: valid_from of a player's first row
  is the first time he was loaded, not when that state began.
-#}
{%- set tracked = ['full_name', 'position', 'nfl_team', 'status', 'injury_status'] -%}

with versions as (
    select
        version_id,
        player_id,
        {{ tracked | join(', ') }},
        loaded_at,
        md5(concat_ws(
            '|',
            {%- for col in tracked %}
                coalesce({{ col }}, '~'){{ ',' if not loop.last }}
            {%- endfor %}
        )) as tracked_hash
    from {{ ref('stg_sleeper__player_versions') }}
),

changes as (
    select
        *,
        lag(tracked_hash) over (partition by player_id order by version_id) as previous_hash
    from versions
),

starts as (
    -- The first version, and every version where a tracked value changed.
    select *
    from changes
    where previous_hash is distinct from tracked_hash
)

select
    {{ dbt_utils.generate_surrogate_key(['player_id', 'version_id']) }} as player_version_key,
    player_id,
    {{ tracked | join(', ') }},
    loaded_at as valid_from,
    lead(loaded_at) over (partition by player_id order by version_id) as valid_to,  -- null while current
    lead(loaded_at) over (partition by player_id order by version_id) is null as is_current
from starts
