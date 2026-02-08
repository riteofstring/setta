from pathlib import Path
from tempfile import TemporaryDirectory

from setta.project_state.watch_code import _iter_python_files

from tests.utils.setta_paths import temporary_setta_paths


def test_iter_python_files_ignores_custom_state_root_inside_workspace() -> None:
    with TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        workspace_root = root / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)

        # Detached state root that is inside the workspace but not named "setta_files".
        state_root = workspace_root / "state_root"
        (state_root / "nested").mkdir(parents=True, exist_ok=True)
        ignored_file = state_root / "nested" / "ignored.py"
        ignored_file.write_text("IGNORED = True\n", encoding="utf-8")

        (workspace_root / "src").mkdir(parents=True, exist_ok=True)
        kept_file = workspace_root / "src" / "kept.py"
        kept_file.write_text("KEPT = True\n", encoding="utf-8")

        with temporary_setta_paths(
            workspace_root=workspace_root,
            setta_files_root=state_root,
        ):
            files = _iter_python_files(workspace_root, recursive=True)

        assert kept_file in files
        assert ignored_file not in files
