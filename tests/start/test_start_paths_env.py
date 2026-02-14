import os
from pathlib import Path

from setta.start import _apply_paths_to_env
from setta.utils.paths import clear_setta_paths_cache, resolve_setta_paths


def test_apply_paths_to_env_persists_setta_files_location(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    paths = resolve_setta_paths(workspace_root=workspace, setta_files_location="global")

    keys = [
        "SETTA_WORKSPACE_ROOT",
        "SETTA_HOME",
        "SETTA_FILES_ROOT",
        "SETTA_FILES_LOCATION",
        "SETTA_RUNTIME_ROOT",
        "SETTA_PROFILE",
    ]
    previous = {key: os.environ.get(key) for key in keys}
    try:
        for key in keys:
            os.environ.pop(key, None)
        clear_setta_paths_cache()

        _apply_paths_to_env(paths)

        assert os.environ["SETTA_WORKSPACE_ROOT"] == str(workspace.resolve())
        assert os.environ["SETTA_HOME"] == str(paths.setta_home)
        assert os.environ["SETTA_FILES_LOCATION"] == "global"
        assert "SETTA_FILES_ROOT" not in os.environ
        assert os.environ["SETTA_RUNTIME_ROOT"] == str(paths.runtime_root)
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        clear_setta_paths_cache()
