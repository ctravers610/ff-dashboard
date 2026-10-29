# Extract and load for the analytics warehouse: copies Sleeper's API responses
# and the app's own history tables, unchanged, into the raw schema of a separate
# database. Everything after that (cleaning, modeling) happens in dbt.
