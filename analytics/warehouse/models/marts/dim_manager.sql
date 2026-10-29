-- One row per person who has managed a team in any loaded league.
with memberships as (
    select
        members.user_id,
        members.display_name,
        leagues.season,
        row_number() over (partition by members.user_id order by leagues.season desc, leagues.league_id) as newest
    from {{ ref('stg_sleeper__league_members') }} as members
    inner join {{ ref('stg_sleeper__leagues') }} as leagues on leagues.league_id = members.league_id
)

select
    memberships.user_id as manager_id,
    max(case when memberships.newest = 1 then memberships.display_name end) as display_name,  -- as of the latest season
    count(*) as leagues_played,
    min(memberships.season) as first_season,
    max(memberships.season) as last_season,
    bool_or(me.user_id is not null) as is_me
from memberships
left join {{ ref('stg_sleeper__users') }} as me on me.user_id = memberships.user_id
group by memberships.user_id
