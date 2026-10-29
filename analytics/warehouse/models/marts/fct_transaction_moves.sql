-- One row per player added or dropped in a transaction (waiver claim, free
-- agent, trade, commissioner move), failed claims included. For completed
-- adds: what the player then did for that team until it dropped him, which
-- is how waiver and trade pickups can be judged.
with transaction_moves as (
    select * from {{ ref('stg_sleeper__transaction_moves') }}
),

transactions as (
    select * from {{ ref('stg_sleeper__transactions') }}
),

leagues as (
    select * from {{ ref('stg_sleeper__leagues') }}
),

player_weeks as (
    select * from {{ ref('int_player_weeks') }}
),

teams as (
    select * from {{ ref('dim_team') }}
),

moves as (
    select
        transaction_moves.*,
        transactions.transaction_type,
        transactions.status,
        transactions.created_at,
        transactions.processed_at,
        transactions.waiver_bid,
        transactions.creator_user_id
    from transaction_moves
    inner join transactions
        on transactions.transaction_id = transaction_moves.transaction_id
),

completed_adds as (
    select
        adds.transaction_id,
        adds.player_id,
        next_drop.dropped_week
    from moves as adds
    -- The next time the same team dropped him, if it did.
    left join lateral (
        select min(drops.week) as dropped_week
        from moves as drops
        where
            drops.league_id = adds.league_id
            and drops.roster_id = adds.roster_id
            and drops.player_id = adds.player_id
            and drops.action = 'drop'
            and drops.status = 'complete'
            and drops.created_at > adds.created_at
    ) as next_drop on true
    where
        adds.action = 'add'
        and adds.status = 'complete'
),

after_add as (
    -- His weeks on that roster from the add until the drop. Matchup rosters
    -- show where he actually was, so the drop week counts only if he was still there.
    select
        completed_adds.transaction_id,
        completed_adds.player_id,
        completed_adds.dropped_week,
        count(player_weeks.week)::int as weeks_rostered,
        (count(player_weeks.week) filter (where player_weeks.is_starter))::int as weeks_started,
        coalesce(sum(player_weeks.points) filter (where player_weeks.is_starter), 0) as points_started
    from completed_adds
    inner join moves as adds
        on
            adds.transaction_id = completed_adds.transaction_id
            and adds.player_id = completed_adds.player_id
            and adds.action = 'add'
    left join player_weeks
        on
            player_weeks.league_id = adds.league_id
            and player_weeks.roster_id = adds.roster_id
            and player_weeks.player_id = adds.player_id
            and player_weeks.week >= adds.week
            and (completed_adds.dropped_week is null or player_weeks.week <= completed_adds.dropped_week)
    group by 1, 2, 3
)

select
    {{ dbt_utils.generate_surrogate_key(['moves.transaction_id', 'moves.action', 'moves.player_id']) }} as move_key,
    moves.transaction_id,
    {{ dbt_utils.generate_surrogate_key(['moves.league_id', 'moves.roster_id']) }} as team_key,
    moves.league_id,
    leagues.season,
    moves.week,
    leagues.season * 100 + moves.week as week_key,
    moves.roster_id,
    moves.player_id,
    moves.action,
    moves.transaction_type,
    moves.status,
    moves.created_at,
    moves.processed_at,
    case when moves.action = 'add' then moves.waiver_bid end as waiver_bid,
    teams.is_mine,
    after_add.dropped_week,
    after_add.weeks_rostered,
    after_add.weeks_started,
    after_add.points_started
from moves
inner join leagues on leagues.league_id = moves.league_id
left join teams
    on
        teams.league_id = moves.league_id
        and teams.roster_id = moves.roster_id
left join after_add
    on
        after_add.transaction_id = moves.transaction_id
        and after_add.player_id = moves.player_id
        and moves.action = 'add'
