import os
from pathlib import Path

from setta.utils.constants import C


def resolve_sessions_root(workspace: Path | str | None) -> Path | None:
    if workspace is None:
        return None
    sessions_root = C.RUN_SESSIONS_FOLDER
    if sessions_root.is_absolute():
        return sessions_root
    raw = str(workspace) if isinstance(workspace, Path) else workspace
    expanded = os.path.expandvars(os.path.expanduser(raw))
    return Path(expanded).resolve() / sessions_root
