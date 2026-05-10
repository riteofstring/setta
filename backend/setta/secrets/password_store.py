import json
import os
from pathlib import Path
from typing import cast

from filelock import FileLock
from setta.types.generated.go_shared_constants import (
    PASSWORD_STORE_FILENAME,
    RUNTIME_ROOT_ENV,
)
from setta.utils.paths import get_setta_paths


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


def _load_password_store_payload(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8")
    if not raw.strip():
        return None
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Password store must be a JSON object.")
    return cast("dict[str, object]", payload)


def _read_password_store_unlocked(path: Path) -> dict[str, str]:
    payload = _load_password_store_payload(path)
    if payload is None:
        return {}
    invalid_key = next(
        (key for key, value in payload.items() if not isinstance(value, str)),
        None,
    )
    if invalid_key is not None:
        raise ValueError(f"Password store value for {invalid_key} must be a string.")
    return cast("dict[str, str]", payload)


def read_password_store() -> dict[str, str]:
    path = _password_store_path()
    lock = _lock_for_path(path)
    with lock:
        return _read_password_store_unlocked(path)


def get_password_secret(code_obj_impl_id: str) -> str:
    payload = read_password_store()
    return payload.get(code_obj_impl_id, "")
