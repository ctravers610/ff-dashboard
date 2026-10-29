# Airflow with Astronomer Cosmos, running the warehouse on this computer:
# `docker compose --profile airflow up --build` from the repository root,
# then http://localhost:8081. Build context: analytics/.
FROM apache/airflow:3.3.2-python3.12

RUN pip install --no-cache-dir "astronomer-cosmos==1.15.1"

# The loader and dbt get their own virtualenv, so their dependencies never
# clash with Airflow's. The code itself is mounted at /opt/analytics at run
# time (see docker-compose.yml), so edits don't need a rebuild.
USER root
RUN mkdir /opt/dbt-venv && chown airflow:root /opt/dbt-venv
USER airflow
COPY --chown=airflow:root pyproject.toml /opt/ffd-analytics/pyproject.toml
COPY --chown=airflow:root loader /opt/ffd-analytics/loader
RUN python -m venv /opt/dbt-venv \
    && /opt/dbt-venv/bin/pip install --no-cache-dir "/opt/ffd-analytics[metrics]"
