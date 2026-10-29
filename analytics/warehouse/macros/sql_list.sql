{#- A list of strings as SQL literals: ['QB', 'RB'] -> 'QB', 'RB' -#}
{% macro sql_list(values) -%}
    {{ "'" ~ values | join("', '") ~ "'" }}
{%- endmacro %}
