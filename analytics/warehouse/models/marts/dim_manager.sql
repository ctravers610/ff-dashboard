-- One row per person who has managed a team in any loaded league.
with members as (
    select * from {{ ref('stg_sleeper__league_members') }}
),

leagues as (
    select * from {{ ref('stg_sleeper__leagues') }}
),

me as (
    select * from {{ ref('stg_sleeper__users') }}
),

memberships as (
    select
        members.user_id,
        members.display_name,
        leagues.season,
        row_number() over (
            partition by members.user_id
            order by leagues.season desc, leagues.league_id asc
        ) as newest
    from members
    inner join leagues on leagues.league_id = members.league_id
)

select
    memberships.user_id as manager_id,
    max(case when memberships.newest = 1 then memberships.display_name end) as display_name,  -- as of the latest season
    count(*)::int as leagues_played,
    min(memberships.season) as first_season,
    max(memberships.season) as last_season,
    bool_or(me.user_id is not null) as is_me
from memberships
left join me on me.user_id = memberships.user_id
group by memberships.user_id
