with latest as (
    {{ latest_version(source('raw', 'sleeper_draft_picks'), ['draft_id']) }}
)

select
    latest.draft_id,
    (pick ->> 'pick_no')::int as pick_no,
    (pick ->> 'round')::int as round,
    (pick ->> 'draft_slot')::int as draft_slot,
    (pick ->> 'roster_id')::int as roster_id,
    pick ->> 'picked_by' as picked_by_user_id,
    pick ->> 'player_id' as player_id,
    coalesce((pick ->> 'is_keeper')::boolean, false) as is_keeper,
    -- The player as he was at the draft.
    pick -> 'metadata' ->> 'position' as position,
    nullif(pick -> 'metadata' ->> 'team', '') as nfl_team,
    (pick -> 'metadata' ->> 'amount')::int as auction_amount
from latest
cross join jsonb_array_elements(latest.payload) as pick
