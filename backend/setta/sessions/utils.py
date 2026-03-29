from pathlib import Path

from setta.utils.paths import resolve_setta_paths


def resolve_sessions_root(workspace: Path | str | None) -> Path | None:
    if workspace is None:
        return None
    paths = resolve_setta_paths(workspace_root=workspace)
    return paths.runtime_sessions_root
