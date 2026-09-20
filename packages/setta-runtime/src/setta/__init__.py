import tomllib as _tomllib
from importlib.metadata import version as _installed_version
from pathlib import Path as _Path


def _source_version() -> str | None:
    project_path = _Path(__file__).resolve().parents[4] / "pyproject.toml"
    if not project_path.is_file():
        return None
    with project_path.open("rb") as stream:
        project = _tomllib.load(stream).get("project")
    if not isinstance(project, dict) or project.get("name") != "setta":
        return None
    candidate = project.get("version")
    return candidate if isinstance(candidate, str) and candidate else None


__version__ = _source_version() or _installed_version("setta")
