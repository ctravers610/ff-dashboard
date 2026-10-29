-- One row per day, which MetricFlow needs to line metrics up over time.
select day::date as date_day
from generate_series('2017-01-01'::date, '2035-12-31'::date, interval '1 day') as days (day)
