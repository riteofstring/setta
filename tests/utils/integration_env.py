import os
from pathlib import Path

from dotenv import dotenv_values

_REPO_ROOT = Path(__file__).resolve().parents[2]
_REPO_DOT_ENV_PATH = _REPO_ROOT / ".env"


def load_repo_dot_env_keys(
    key_names: tuple[str, ...],
    *,
    dot_env_path: Path | None = None,
) -> dict[str, str]:
    path = _REPO_DOT_ENV_PATH if dot_env_path is None else dot_env_path
    if not path.is_file():
        return {}

    parsed = dotenv_values(path, interpolate=False)
    resolved: dict[str, str] = {}
    for key_name in key_names:
        raw_value = parsed.get(key_name)
        if raw_value is None:
            continue
        normalized = raw_value.strip()
        if normalized == "":
            continue
        resolved[key_name] = normalized
    return resolved


def seed_env_from_repo_dot_env(
    key_names: tuple[str, ...],
    *,
    dot_env_path: Path | None = None,
) -> None:
    values = load_repo_dot_env_keys(key_names, dot_env_path=dot_env_path)
    for key_name, value in values.items():
        os.environ.setdefault(key_name, value)
