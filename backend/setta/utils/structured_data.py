import json
from pathlib import Path
from typing import Any

from setta.database.db_objs import DBE

SUPPORTED_JSON_SOURCE_EXTS = {".json", ".yaml", ".yml", ".toml"}


def read_json_source_payload(path: Path, dbe: DBE) -> dict:
    suffix = _ensure_supported_json_source_path(path)
    if not path.exists():
        raise FileNotFoundError(f"JSON source file not found: {path}")
    if suffix == ".json":
        raw = dbe.read(path)
        if raw is None:
            raise FileNotFoundError(f"JSON source file not found: {path}")
        payload = json.loads(raw)
    elif suffix in {".yaml", ".yml"}:
        payload = dbe.read_yaml(path)
    else:
        payload = dbe.read_toml(path)

    if not isinstance(payload, dict):
        raise ValueError(
            f"JSON source payload must be a dict at the root: {path} (got {type(payload).__name__})"
        )
    _validate_json_subset(payload, str(path))
    return payload


def write_json_source_payload(path: Path, payload: dict, dbe: DBE) -> None:
    suffix = _ensure_supported_json_source_path(path)
    if not isinstance(payload, dict):
        raise ValueError(
            f"JSON source payload must be a dict at the root: {path} (got {type(payload).__name__})"
        )
    _validate_json_subset(payload, str(path))
    if suffix == ".json":
        dbe.write(path, json.dumps(payload, indent=2))
    elif suffix in {".yaml", ".yml"}:
        dbe.write_yaml(path, payload)
    else:
        dbe.write_toml(path, payload)


def _ensure_supported_json_source_path(path: Path) -> str:
    suffix = path.suffix.lower()
    if not suffix:
        raise ValueError(f"JSON source file must include an extension: {path}")
    if suffix not in SUPPORTED_JSON_SOURCE_EXTS:
        raise ValueError(f"Unsupported jsonSource file extension: {path}")
    return suffix


def _validate_json_subset(value: Any, path: str) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError(
                    f"JSON source dict keys must be strings at {path} (got {type(key).__name__})"
                )
            next_path = f"{path}.{key}" if path else key
            _validate_json_subset(item, next_path)
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _validate_json_subset(item, f"{path}[{index}]")
        return
    if value is None or isinstance(value, (str, int, float, bool)):
        return
    raise ValueError(
        f"JSON source payload contains non-JSON type at {path}: {type(value).__name__}"
    )
