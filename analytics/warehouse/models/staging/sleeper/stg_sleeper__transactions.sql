with latest as (
    {{ latest_version(source('raw', 'sleeper_transactions'), ['league_id', 'week']) }}
)

select
    txn ->> 'transaction_id' as transaction_id,
    latest.league_id,
    latest.week,
    txn ->> 'type' as transaction_type,  -- waiver, free_agent, trade, commissioner
    txn ->> 'status' as status,  -- complete, failed
    {{ epoch_ms("txn ->> 'created'") }} as created_at,
    {{ epoch_ms("txn ->> 'status_updated'") }} as processed_at,
    txn ->> 'creator' as creator_user_id,
    {{ jsonb_array("txn -> 'roster_ids'") }} as roster_ids,
    (txn -> 'settings' ->> 'waiver_bid')::int as waiver_bid,  -- FAAB dollars, waiver claims only
    txn -> 'metadata' ->> 'notes' as notes,  -- why a claim failed
    jsonb_array_length({{ jsonb_array("txn -> 'draft_picks'") }}) > 0 as includes_draft_picks,
    jsonb_array_length({{ jsonb_array("txn -> 'waiver_budget'") }}) > 0 as includes_faab
from latest
cross join jsonb_array_elements(latest.payload) as txn
