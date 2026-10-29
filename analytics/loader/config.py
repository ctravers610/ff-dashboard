import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LOCAL_SERVER = 'postgres://ffd:ffd_dev_password@127.0.0.1:5432'


@dataclass(frozen=True)
class Config:
    analytics_url: str  # where raw data lands; never the app's own database
    app_url: str  # the app's database, read-only: history tables and added Sleeper accounts
    sleeper_api: str
    usernames: list[str]


def read_env_file(path: Path) -> dict[str, str]:
    """The KEY=value lines of a .env file, the same file the app reads."""
    if not path.exists():
        return {}
    values = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_config(env: dict[str, str] | None = None) -> Config:
    # Real environment variables win over .env, as they do for the app.
    env = {**read_env_file(REPO_ROOT / '.env'), **os.environ} if env is None else env
    return Config(
        analytics_url=env.get('ANALYTICS_DATABASE_URL', f'{LOCAL_SERVER}/ffd_analytics'),
        app_url=env.get('APP_DATABASE_URL') or env.get('DATABASE_URL') or f'{LOCAL_SERVER}/ffd',
        sleeper_api=env.get('SLEEPER_API_URL', 'https://api.sleeper.app/v1'),
        usernames=[u.strip() for u in env.get('SLEEPER_USERNAMES', '').split(',') if u.strip()],
    )
