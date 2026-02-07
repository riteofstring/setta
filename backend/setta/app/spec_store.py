from pathlib import Path

from setta.database.db_objs import DBE
from setta.types.chat_messages import JSONValue
from setta.utils.utils import normalize_path


def default_app_spec_path() -> str:
    return (Path("app_specs") / "app.json").as_posix()


def resolve_app_spec_path(dbe: DBE, app_spec_path: str) -> Path:
    root = (dbe.path / "app_specs").resolve()
    raw_path = Path(app_spec_path)
    if raw_path.is_absolute():
        resolved = raw_path.resolve()
    else:
        resolved = (dbe.path / raw_path).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError(
            "App spec path must live under the app_specs folder in the project root."
        )
    return resolved


def normalize_app_spec_path(dbe: DBE, app_spec_path: str) -> str:
    resolved = resolve_app_spec_path(dbe, app_spec_path)
    try:
        return resolved.relative_to(dbe.path.resolve()).as_posix()
    except ValueError:
        return normalize_path(resolved).as_posix()


def read_app_spec(dbe: DBE, app_spec_path: str) -> JSONValue | None:
    resolved = resolve_app_spec_path(dbe, app_spec_path)
    payload = dbe.read_json(resolved)
    if not payload:
        return None
    return payload


def write_app_spec(dbe: DBE, app_spec_path: str, app_spec: JSONValue) -> None:
    resolved = resolve_app_spec_path(dbe, app_spec_path)
    dbe.write_json(resolved, app_spec)
