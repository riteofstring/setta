import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator
from unittest.mock import patch

from setta.utils.paths import clear_setta_paths_cache


@contextmanager
def temporary_setta_paths(
    *,
    workspace_root: Path | None = None,
    setta_files_root: Path | None = None,
    runtime_root: Path | None = None,
    files_root_base: Path | None = None,
) -> Iterator[None]:
    env_updates: dict[str, str] = {}
    if workspace_root is not None:
        env_updates["SETTA_WORKSPACE_ROOT"] = str(workspace_root)
    if setta_files_root is not None:
        env_updates["SETTA_FILES_ROOT"] = str(setta_files_root)
        if runtime_root is None:
            env_updates["SETTA_RUNTIME_ROOT"] = str(setta_files_root / "runtime")
    if runtime_root is not None:
        env_updates["SETTA_RUNTIME_ROOT"] = str(runtime_root)
    if files_root_base is not None:
        env_updates["SETTA_FILES_ROOT_BASE"] = str(files_root_base)
    with patch.dict(os.environ, env_updates, clear=False):
        clear_setta_paths_cache()
        try:
            yield
        finally:
            clear_setta_paths_cache()
