{#- Sleeper's timestamps are milliseconds since 1970. -#}
{% macro epoch_ms(expression) -%}
    to_timestamp(({{ expression }})::bigint / 1000.0)
{%- endmacro %}
