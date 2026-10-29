-- One row per player added to or dropped from a roster in a transaction. A trade
-- has an add and a drop for every player in it.
with latest as (
    {{ latest_version(source('raw', 'sleeper_transactions'), ['league_id', 'week']) }}
),

transactions as (
    select latest.league_id, latest.week, txn
    from latest
    cross join jsonb_array_elements(latest.payload) as txn
)

select
    transactions.txn ->> 'transaction_id' as transaction_id,
    transactions.league_id,
    transactions.week,
    moves.action,
    moves.player_id,
    moves.roster_id::int as roster_id
from transactions
cross join lateral (
    select 'add' as action, key as player_id, value as roster_id
    from jsonb_each_text({{ jsonb_object("transactions.txn -> 'adds'") }})
    union all
    select 'drop' as action, key as player_id, value as roster_id
    from jsonb_each_text({{ jsonb_object("transactions.txn -> 'drops'") }})
) as moves
