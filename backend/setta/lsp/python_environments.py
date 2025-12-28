import os
import sys
from pathlib import Path

from setta.types.language_server import (
    PythonEnvironmentInfo,
    PythonEnvironmentSource,
)
from setta.utils.utils import resolve_workspace_root

_VENV_DIR_NAMES = (".venv", "venv", ".env", "env")
_PYENV_ROOT_ENV = "PYENV_ROOT"
_CONDA_ROOT_CANDIDATES = (
    "miniconda3",
    "miniforge3",
    "mambaforge",
    "anaconda3",
)


def _is_executable(path: Path) -> bool:
    return path.is_file() and os.access(path, os.X_OK)


def _looks_like_python_executable(path: Path) -> bool:
    name = path.stem
    if not name.startswith("python"):
        return False
    suffix = name[len("python") :]
    if not suffix:
        return True
    return all(ch.isdigit() or ch == "." for ch in suffix)


def _venv_python_path(venv_root: Path) -> Path:
    if os.name == "nt":
        return venv_root / "Scripts" / "python.exe"
    return venv_root / "bin" / "python"


def _add_candidate(
    candidates: dict[str, PythonEnvironmentInfo],
    path: Path,
    *,
    source: PythonEnvironmentSource,
    label: str,
) -> None:
    if not _is_executable(path):
        return
    normalized = str(path.resolve())
    if normalized in candidates:
        return
    candidates[normalized] = PythonEnvironmentInfo(
        path=normalized,
        label=label,
        source=source,
    )


def _add_project_venvs(
    candidates: dict[str, PythonEnvironmentInfo],
    project_root: Path,
) -> None:
    for venv_name in _VENV_DIR_NAMES:
        venv_root = project_root / venv_name
        python_path = _venv_python_path(venv_root)
        _add_candidate(
            candidates,
            python_path,
            source=PythonEnvironmentSource.venv,
            label=f"{venv_name} (venv)",
        )


def _add_pyenv_versions(candidates: dict[str, PythonEnvironmentInfo]) -> None:
    pyenv_root = Path(
        os.environ.get(_PYENV_ROOT_ENV, Path.home() / ".pyenv")
    ).expanduser()
    versions_dir = pyenv_root / "versions"
    if not versions_dir.exists():
        return
    for version_dir in versions_dir.iterdir():
        if not version_dir.is_dir():
            continue
        python_path = version_dir / "bin" / "python"
        _add_candidate(
            candidates,
            python_path,
            source=PythonEnvironmentSource.pyenv,
            label=f"{version_dir.name} (pyenv)",
        )


def _add_conda_envs(candidates: dict[str, PythonEnvironmentInfo]) -> None:
    conda_roots = [Path.home() / name for name in _CONDA_ROOT_CANDIDATES]
    for conda_root in conda_roots:
        envs_dir = conda_root / "envs"
        if not envs_dir.exists():
            continue
        for env_dir in envs_dir.iterdir():
            if not env_dir.is_dir():
                continue
            python_path = env_dir / "bin" / "python"
            _add_candidate(
                candidates,
                python_path,
                source=PythonEnvironmentSource.conda,
                label=f"{env_dir.name} (conda)",
            )


def _add_path_binaries(candidates: dict[str, PythonEnvironmentInfo]) -> None:
    path_env = os.environ.get("PATH", "")
    for entry in path_env.split(os.pathsep):
        if not entry:
            continue
        dir_path = Path(entry)
        if not dir_path.is_dir():
            continue
        if not os.access(dir_path, os.R_OK | os.X_OK):
            continue
        for candidate in dir_path.iterdir():
            if not _looks_like_python_executable(candidate):
                continue
            _add_candidate(
                candidates,
                candidate,
                source=PythonEnvironmentSource.path,
                label=candidate.name,
            )


def list_python_environments(
    project_root: Path | None = None,
) -> list[PythonEnvironmentInfo]:
    candidates: dict[str, PythonEnvironmentInfo] = {}
    current_path = Path(sys.executable)
    _add_candidate(
        candidates,
        current_path,
        source=PythonEnvironmentSource.current,
        label="Current (sys.executable)",
    )

    root = project_root if project_root else resolve_workspace_root()
    if root.exists():
        _add_project_venvs(candidates, root)

    _add_pyenv_versions(candidates)
    _add_conda_envs(candidates)
    _add_path_binaries(candidates)

    return list(candidates.values())
