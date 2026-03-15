import json
import os
from pathlib import Path

from filelock import FileLock

from setta.utils.env_vars import RUNTIME_ROOT_ENV
from setta.utils.paths import get_setta_paths

PASSWORD_STORE_FILENAME = "passwords.json"


def _runtime_secrets_root() -> Path:
    runtime_root = os.environ.get(RUNTIME_ROOT_ENV)
    if runtime_root:
        return Path(runtime_root) / "secrets"
    return get_setta_paths().runtime_secrets_root


def _password_store_path() -> Path:
    return _runtime_secrets_root() / PASSWORD_STORE_FILENAME


def _ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _lock_for_path(path: Path) -> FileLock:
    _ensure_parent_dir(path)
    return FileLock(f"{path}.lock")


def _read_password_store_unlocked(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    raw = path.read_text(encoding="utf-8")
    if not raw.strip():
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Password store must be a JSON object.")
    output: dict[str, str] = {}
    for key, value in payload.items():
        if not isinstance(key, str):
            raise ValueError("Password store keys must be strings.")
        if not isinstance(value, str):
            raise ValueError(f"Password store value for {key} must be a string.")
        output[key] = value
    return output


def read_password_store() -> dict[str, str]:
    path = _password_store_path()
    lock = _lock_for_path(path)
    with lock:
        return _read_password_store_unlocked(path)


def get_password_secret(code_obj_impl_id: str) -> str:
    payload = read_password_store()
    return payload.get(code_obj_impl_id, "")
