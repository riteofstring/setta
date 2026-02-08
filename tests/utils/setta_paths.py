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
    setta_files_root: Path | None = None,
    setta_files_location: str | None = None,
    setta_home: Path | None = None,
) -> Iterator[None]:
    env_updates: dict[str, str] = {}
    resolved_workspace_root = workspace_root

    if setta_home is not None:
        env_updates["SETTA_HOME"] = str(setta_home)

    if setta_files_root is not None:
        # Setta no longer supports explicit state-root overrides. This parameter is
        # kept for tests that already pass workspace_root/"setta_files".
        if resolved_workspace_root is None:
            if setta_files_root.name != "setta_files":
                raise ValueError(
                    "temporary_setta_paths(setta_files_root=...) requires the path to be named 'setta_files'. "
                    "Update the test to use setta_files_location + config instead."
                )
            resolved_workspace_root = setta_files_root.parent
        expected_local_root = (resolved_workspace_root / "setta_files").resolve(
            strict=False
        )
        if expected_local_root != setta_files_root.resolve(strict=False):
            raise ValueError(
                "temporary_setta_paths(setta_files_root=...) must match workspace_root/'setta_files'. "
                "Update the test to rely on local/global resolution instead of an explicit state root."
            )
        if setta_files_location is None:
            setta_files_location = "local"

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

