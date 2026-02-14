import json
import os
import subprocess
from pathlib import Path

import pytest


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _ensure_local_venv_or_skip() -> None:
    repo_root = _repo_root()
    if not (repo_root / ".venv" / "bin" / "activate").exists():
        pytest.skip("reset-setta-state.sh requires repo .venv activation script.")


def test_reset_setta_state_script_deletes_explicit_root(tmp_path: Path) -> None:
    _ensure_local_venv_or_skip()
    repo_root = _repo_root()
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    explicit_root = tmp_path / "explicit_state"
    (explicit_root / "nested").mkdir(parents=True, exist_ok=True)
    (explicit_root / "nested" / "sentinel.txt").write_text("x", encoding="utf-8")

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "scripts" / "reset-setta-state.sh"),
            "--workspace",
            str(workspace),
            "--setta-files-root",
            str(explicit_root),
        ],
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Deleted Setta state root" in result.stdout
    assert not explicit_root.exists()


def test_reset_setta_state_script_resolves_profile_root(tmp_path: Path) -> None:
    _ensure_local_venv_or_skip()
    repo_root = _repo_root()
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    setta_home = tmp_path / "setta_home"
    profile_root = tmp_path / "profile_state"
    (profile_root / "nested").mkdir(parents=True, exist_ok=True)
    (profile_root / "nested" / "sentinel.txt").write_text("x", encoding="utf-8")

    profile_path = setta_home / "profiles" / "dev.json"
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(
            {
                "name": "dev",
                "workspaceRoot": str(workspace),
                "settaFilesRoot": str(profile_root),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "scripts" / "reset-setta-state.sh"),
            "--setta-home",
            str(setta_home),
            "--profile",
            "dev",
        ],
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert not profile_root.exists()


def test_reset_setta_state_script_cli_root_overrides_inherited_location(
    tmp_path: Path,
) -> None:
    _ensure_local_venv_or_skip()
    repo_root = _repo_root()
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    explicit_root = tmp_path / "explicit_state"
    (explicit_root / "nested").mkdir(parents=True, exist_ok=True)
    (explicit_root / "nested" / "sentinel.txt").write_text("x", encoding="utf-8")

    env = os.environ.copy()
    env["SETTA_FILES_LOCATION"] = "global"

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "scripts" / "reset-setta-state.sh"),
            "--workspace",
            str(workspace),
            "--setta-files-root",
            str(explicit_root),
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert not explicit_root.exists()


def test_reset_setta_state_script_cli_location_overrides_inherited_root(
    tmp_path: Path,
) -> None:
    _ensure_local_venv_or_skip()
    repo_root = _repo_root()
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    local_root = workspace / "setta_files"
    (local_root / "nested").mkdir(parents=True, exist_ok=True)
    (local_root / "nested" / "sentinel.txt").write_text("x", encoding="utf-8")
    inherited_root = tmp_path / "inherited_state"
    inherited_root.mkdir(parents=True, exist_ok=True)
    (inherited_root / "keep.txt").write_text("keep", encoding="utf-8")

    env = os.environ.copy()
    env["SETTA_FILES_ROOT"] = str(inherited_root)

    result = subprocess.run(
        [
            "bash",
            str(repo_root / "scripts" / "reset-setta-state.sh"),
            "--workspace",
            str(workspace),
            "--setta-files-location",
            "local",
        ],
        cwd=repo_root,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert not local_root.exists()
    assert inherited_root.exists()
