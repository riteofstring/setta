import json
import os
from pathlib import Path

from filelock import FileLock

from setta.utils.constants import C

RUNTIME_ROOT_ENV = "SETTA_RUNTIME_ROOT"
PASSWORD_STORE_FILENAME = "passwords.json"
PASSWORD_STORE_SUBDIR = "runtime/secrets"


def _runtime_root() -> Path:
    root = os.environ.get(RUNTIME_ROOT_ENV)
    if root:
        return Path(root)
    return C.SETTA_FILES_FOLDER


def _password_store_path() -> Path:
    return _runtime_root() / PASSWORD_STORE_SUBDIR / PASSWORD_STORE_FILENAME


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


def _write_password_store_unlocked(path: Path, payload: dict[str, str]) -> None:
    _ensure_parent_dir(path)
    content = json.dumps(payload, indent=2, sort_keys=True)
    if content:
        content += "\n"
    path.write_text(content, encoding="utf-8")


def write_password_store(payload: dict[str, str]) -> None:
    path = _password_store_path()
    lock = _lock_for_path(path)
    with lock:
        _write_password_store_unlocked(path, payload)


def set_password_secret(code_obj_impl_id: str, value: str) -> None:
    path = _password_store_path()
    lock = _lock_for_path(path)
    with lock:
        payload = _read_password_store_unlocked(path)
        if value == "":
            payload.pop(code_obj_impl_id, None)
        else:
            payload[code_obj_impl_id] = value
        _write_password_store_unlocked(path, payload)


def get_password_secret(code_obj_impl_id: str) -> str:
    payload = read_password_store()
    return payload.get(code_obj_impl_id, "")
