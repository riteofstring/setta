import os
from pathlib import Path

from setta.sessions.registry import SessionRegistry
from setta.utils.env_vars import (
    FILES_LOCATION_ENV,
    FILES_ROOT_ENV,
    PROFILE_ENV,
    RUNTIME_ROOT_ENV,
)
from setta.utils.paths import resolve_setta_paths

_LOCAL_SESSION_ROOT_NAMES = ("setta_files", "setta_files_dev")
_EXPLICIT_SESSION_ROOT_ENV_VARS = (
    FILES_LOCATION_ENV,
    FILES_ROOT_ENV,
    PROFILE_ENV,
    RUNTIME_ROOT_ENV,
)


def resolve_sessions_root(workspace: Path | str | None) -> Path | None:
    if workspace is None:
        return None
    workspace_path = Path(workspace).resolve(strict=False)
    paths = resolve_setta_paths(workspace_root=workspace_path)
    resolved_sessions_root = paths.runtime_sessions_root

    if any(os.environ.get(env_var) for env_var in _EXPLICIT_SESSION_ROOT_ENV_VARS):
        return resolved_sessions_root

    matching_sessions_root = _find_matching_workspace_sessions_root(
        workspace_path=workspace_path,
        resolved_sessions_root=resolved_sessions_root,
    )
    if matching_sessions_root is not None:
        return matching_sessions_root

    return resolved_sessions_root


def _find_matching_workspace_sessions_root(
    *,
    workspace_path: Path,
    resolved_sessions_root: Path,
) -> Path | None:
    for sessions_root in _candidate_sessions_roots(
        workspace_path=workspace_path,
        resolved_sessions_root=resolved_sessions_root,
    ):
        if not sessions_root.exists():
            continue
        registry = SessionRegistry(sessions_root=sessions_root)
        sessions = registry.find_sessions_by_workspace(
            workspace_path, prune_stale=False
        )
        if sessions:
            return sessions_root

    return None


def _candidate_sessions_roots(
    *,
    workspace_path: Path,
    resolved_sessions_root: Path,
) -> list[Path]:
    candidates = [resolved_sessions_root]

    for setta_files_root_name in _LOCAL_SESSION_ROOT_NAMES:
        candidate = (
            workspace_path / setta_files_root_name / "runtime" / "sessions"
        ).resolve(strict=False)
        if candidate not in candidates:
            candidates.append(candidate)

    return candidates
