import os
from pathlib import Path

from setta.start import _apply_paths_to_env
from setta.utils.paths import clear_setta_paths_cache, resolve_setta_paths


def test_apply_paths_to_env_persists_files_root_base(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    files_root_base = tmp_path / "files-root-base"
    files_root_base.mkdir()

    paths = resolve_setta_paths(workspace_root=workspace, files_root_base=files_root_base)

    keys = ["SETTA_WORKSPACE_ROOT", "SETTA_FILES_ROOT", "SETTA_FILES_ROOT_BASE"]
    previous = {key: os.environ.get(key) for key in keys}
    try:
        for key in keys:
            os.environ.pop(key, None)
        clear_setta_paths_cache()

        _apply_paths_to_env(paths, files_root_base=files_root_base)

        assert os.environ["SETTA_WORKSPACE_ROOT"] == str(workspace.resolve())
        assert os.environ["SETTA_FILES_ROOT"] == str(paths.setta_files_root)
        assert os.environ["SETTA_FILES_ROOT_BASE"] == str(files_root_base.resolve())
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        clear_setta_paths_cache()
