import json
import tempfile
from pathlib import Path

from setta.secrets.password_store import (
    _lock_for_path,
    _password_store_path,
    _read_password_store_unlocked,
)


def set_password_secret(code_obj_impl_id: str, value: str) -> None:
    path = _password_store_path()
    lock = _lock_for_path(path)
    with lock:
        payload = _read_password_store_unlocked(path)
        if value == "":
            payload.pop(code_obj_impl_id, None)
        else:
            payload[code_obj_impl_id] = value
        _write_password_store(path, payload)


def _write_password_store(path: Path, payload: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(payload, indent=2, sort_keys=True)
    if content:
        content += "\n"
    with tempfile.NamedTemporaryFile(
        mode="w",
        dir=path.parent,
        delete=False,
        encoding="utf-8",
        suffix=".tmp",
    ) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    Path(tmp_path).replace(path)
