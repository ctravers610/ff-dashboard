"""
### The warehouse, daily

1. **load**: the loader copies what's new from Sleeper and the app's database
   into the raw schema (`python -m loader`).
2. **dbt**: every dbt model built and then tested, one Airflow task per model
   (Astronomer Cosmos turns the dbt project into this task group).
3. **source_freshness**: warns if the loader has stopped succeeding.

Runs at 11:00 UTC, after Sleeper has the night's stat corrections.
"""

from datetime import datetime
from pathlib import Path

from airflow.providers.standard.operators.bash import BashOperator
from airflow.sdk import DAG
from cosmos import DbtTaskGroup, ExecutionConfig, ProfileConfig, ProjectConfig, RenderConfig
from cosmos.constants import LoadMode

ANALYTICS = Path('/opt/analytics')  # analytics/, mounted (docker-compose.yml)
WAREHOUSE = ANALYTICS / 'warehouse'
VENV = Path('/opt/dbt-venv/bin')  # dbt and the loader's dependencies (orchestration/Dockerfile)

with DAG(
    dag_id='ffd_warehouse',
    schedule='0 11 * * *',
    start_date=datetime(2026, 9, 1),
    catchup=False,
    max_active_runs=1,
    tags=['warehouse'],
    doc_md=__doc__,
):
    load = BashOperator(task_id='load', bash_command=f'cd {ANALYTICS} && {VENV}/python -m loader')

    dbt = DbtTaskGroup(
        group_id='dbt',
        project_config=ProjectConfig(WAREHOUSE),
        profile_config=ProfileConfig(
            profile_name='ffd',
            target_name='dev',
            profiles_yml_filepath=WAREHOUSE / 'profiles.yml',
        ),
        execution_config=ExecutionConfig(dbt_executable_path=VENV / 'dbt'),
        render_config=RenderConfig(
            load_method=LoadMode.DBT_LS,
            # A test that reads several models (a relationship, a cross-model
            # check) gets its own task after all of them. Run with the first
            # one, it could find another one's view missing: Postgres drops a
            # view's dependents when the view is rebuilt.
            should_detach_multiple_parents_tests=True,
        ),
        operator_args={'install_deps': True},
    )

    freshness = BashOperator(
        task_id='source_freshness',
        bash_command=f'cd {WAREHOUSE} && {VENV}/dbt deps --quiet && {VENV}/dbt source freshness',
    )

    load >> dbt >> freshness
