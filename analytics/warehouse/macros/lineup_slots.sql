{#-
  Lineup slots that take more than one position, in the order a best lineup
  fills them: narrowest first, so a player who fits only a wide slot never
  loses it to one who had somewhere narrower to go. Any other slot (QB, RB,
  K, DEF, ...) takes only the position of the same name and is filled before
  these. The same rules as the app's Lineup Recap (packages/shared/src/slots.ts).
-#}
{% macro flex_slots() %}
    {{ return([
        {'slot': 'WRRB_FLEX', 'positions': ['RB', 'WR']},
        {'slot': 'REC_FLEX', 'positions': ['WR', 'TE']},
        {'slot': 'FLEX', 'positions': ['RB', 'WR', 'TE']},
        {'slot': 'SUPER_FLEX', 'positions': ['QB', 'RB', 'WR', 'TE']},
    ]) }}
{% endmacro %}
