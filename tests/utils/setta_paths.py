import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from setta.utils.paths import clear_setta_paths_cache


@contextmanager
def temporary_setta_paths(
    *,
    workspace_root: Path | None = None,
    runtime_root: Path | None = None,
    setta_files_location: str | None = None,
    setta_home: Path | None = None,
) -> Iterator[None]:
    env_updates: dict[str, str] = {}
    resolved_workspace_root = workspace_root

    if setta_home is not None:
        env_updates["SETTA_HOME"] = str(setta_home)

    if resolved_workspace_root is not None:
        env_updates["SETTA_WORKSPACE_ROOT"] = str(resolved_workspace_root)
    if runtime_root is not None:
        env_updates["SETTA_RUNTIME_ROOT"] = str(runtime_root)
    if setta_files_location is not None:
        env_updates["SETTA_FILES_LOCATION"] = str(setta_files_location)

    previous_values: dict[str, str | None] = {
        key: os.environ.get(key) for key in env_updates
    }
    for key, value in env_updates.items():
        os.environ[key] = value

    clear_setta_paths_cache()
    try:
        yield
    finally:
        for key, value in previous_values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        clear_setta_paths_cache()
