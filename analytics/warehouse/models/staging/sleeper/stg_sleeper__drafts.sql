with latest as (
    {{ latest_version(source('raw', 'sleeper_drafts'), ['league_id']) }}
)

select
    draft ->> 'draft_id' as draft_id,
    latest.league_id,
    (draft ->> 'season')::int as season,
    draft ->> 'type' as draft_type,  -- snake, linear, auction
    draft ->> 'status' as status,
    {{ epoch_ms("draft ->> 'start_time'") }} as started_at,
    (draft -> 'settings' ->> 'rounds')::int as rounds,
    (draft -> 'settings' ->> 'teams')::int as teams,
    draft -> 'metadata' ->> 'scoring_type' as scoring_type,
    draft -> 'draft_order' as draft_order  -- user id → draft slot
from latest
cross join jsonb_array_elements(latest.payload) as draft
