-- One row per fantasy team: a roster in one league's season. The same person's
-- team next season is a new row (a new league_id), tied by manager_id and the
-- league's league_lineage_id.
with rosters as (
    select * from {{ ref('stg_sleeper__rosters') }}
),

leagues as (
    select * from {{ ref('stg_sleeper__leagues') }}
),

members as (
    select * from {{ ref('stg_sleeper__league_members') }}
),

my_users as (
    select user_id from {{ ref('stg_sleeper__users') }}
)

select
    {{ dbt_utils.generate_surrogate_key(['rosters.league_id', 'rosters.roster_id']) }} as team_key,
    rosters.league_id,
    rosters.roster_id,
    leagues.season,
    rosters.owner_user_id as manager_id,
    coalesce(members.team_name, members.display_name, 'Team ' || rosters.roster_id) as team_name,
    members.display_name as manager_name,
    jsonb_array_length(rosters.co_owner_user_ids) > 0 as has_co_owners,
    -- Mine if one of the loaded accounts owns or co-owns it.
    exists(
        select 1 from my_users
        where
            my_users.user_id = rosters.owner_user_id
            or rosters.co_owner_user_ids ? my_users.user_id
    ) as is_mine
from rosters
inner join leagues on leagues.league_id = rosters.league_id
left join members
    on
        members.league_id = rosters.league_id
        and members.user_id = rosters.owner_user_id
