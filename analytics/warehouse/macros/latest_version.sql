{#-
  Raw tables keep every version of an item the source has had (a new row each
  time its payload changed). Staging reads the latest: the highest id per key.
-#}
{% macro latest_version(relation, keys) %}
    select *
    from (
        select
            *,
            row_number() over (
                {% if keys %}partition by {{ keys | join(', ') }}{% endif %}
                order by id desc
            ) as version_rank
        from {{ relation }}
    ) as versions
    where version_rank = 1
{% endmacro %}
