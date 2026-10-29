{#-
  The JSON array (or object) in expression, or an empty one. Sleeper sends
  missing lists as JSON null ("drops": null), which coalesce doesn't catch and
  jsonb_array_elements refuses.
-#}
{% macro jsonb_array(expression) -%}
    case when jsonb_typeof({{ expression }}) = 'array' then {{ expression }} else '[]'::jsonb end
{%- endmacro %}

{% macro jsonb_object(expression) -%}
    case when jsonb_typeof({{ expression }}) = 'object' then {{ expression }} else '{}'::jsonb end
{%- endmacro %}
