from pathlib import Path

from setta.database.db_objs import DBE
from tests.utils.setta_paths import temporary_setta_paths


def test_dbe_dot_env_is_workspace_root_anchored(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    setta_files_root = tmp_path / "state"
    setta_files_root.mkdir()

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_root=setta_files_root,
    ):
        dbe = DBE(setta_files_root)

        expected = (workspace_root / ".env").resolve(strict=False)
        assert dbe.dot_env == expected

        dbe.write_dot_env({"SETTA_TEST_KEY": "value"})
        assert expected.exists()
        assert "SETTA_TEST_KEY=value" in expected.read_text(encoding="utf-8")
        assert not (setta_files_root / ".env").exists()

