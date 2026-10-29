{#- Models go in the schema they name (staging, marts), not "analytics_staging". -#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {{ (custom_schema_name or target.schema) | trim }}
{%- endmacro %}
