from pathlib import Path
from tempfile import TemporaryDirectory
import json
import os

from setta.project_state.watch_code import _iter_python_files
from setta.utils.paths import build_files_root_from_base, clear_setta_paths_cache

from tests.utils.setta_paths import temporary_setta_paths


def test_iter_python_files_ignores_custom_state_root_inside_workspace() -> None:
    with TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        workspace_root = root / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)

        # Global state root that happens to be inside the workspace (because the user
        # configured globalSettaFilesBase that way). It is *not* named "setta_files",
        # so the ignore logic must be path-based rather than name-based.
        setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
        base_root = workspace_root / "state_root_base"
        config_path = setta_home / "config.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(
            json.dumps(
                {
                    "globalSettaFilesBase": str(base_root.resolve(strict=False)),
                    "autoMode": "create_local",
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        clear_setta_paths_cache()

        state_root = build_files_root_from_base(
            base_root.resolve(strict=False),
            workspace_root.resolve(strict=False),
        ).resolve(strict=False)
        (state_root / "nested").mkdir(parents=True, exist_ok=True)
        ignored_file = state_root / "nested" / "ignored.py"
        ignored_file.write_text("IGNORED = True\n", encoding="utf-8")

        (workspace_root / "src").mkdir(parents=True, exist_ok=True)
        kept_file = workspace_root / "src" / "kept.py"
        kept_file.write_text("KEPT = True\n", encoding="utf-8")

        with temporary_setta_paths(
            workspace_root=workspace_root,
            setta_files_location="global",
        ):
            files = _iter_python_files(workspace_root, recursive=True)

        assert kept_file in files
        assert ignored_file not in files


def test_iter_python_files_keeps_user_runtime_named_folders() -> None:
    with TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        workspace_root = root / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)

        # The Setta runtime root is "<workspace>/setta_files/runtime". A user folder
        # with the same basename should not be ignored unless it is under Setta roots.
        user_runtime_dir = workspace_root / "src" / "runtime"
        user_runtime_dir.mkdir(parents=True, exist_ok=True)
        kept_file = user_runtime_dir / "kept.py"
        kept_file.write_text("KEPT = True\n", encoding="utf-8")

        ignored_runtime_file = (
            workspace_root / "setta_files" / "runtime" / "nested" / "ignored.py"
        )
        ignored_runtime_file.parent.mkdir(parents=True, exist_ok=True)
        ignored_runtime_file.write_text("IGNORED = True\n", encoding="utf-8")

        with temporary_setta_paths(
            workspace_root=workspace_root,
            setta_files_location="local",
        ):
            files = _iter_python_files(workspace_root, recursive=True)

        assert kept_file in files
        assert ignored_runtime_file not in files
