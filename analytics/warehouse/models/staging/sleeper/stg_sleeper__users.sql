-- The accounts the loader was asked to load: "my" teams are the ones these own.
with latest as (
    {{ latest_version(source('raw', 'sleeper_users'), ['user_id']) }}
)

select
    user_id,
    payload ->> 'username' as username,
    payload ->> 'display_name' as display_name
from latest
