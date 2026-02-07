import hashlib
from pathlib import Path

import pytest

from setta.sessions.utils import resolve_sessions_root
from setta.utils.paths import (
    build_files_root_from_base,
    resolve_setta_paths,
    validate_workspace_root,
)


@pytest.fixture(autouse=True)
def _clear_runtime_root_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)


def test_resolve_setta_paths_defaults(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.workspace_root == workspace.resolve()
    assert paths.setta_files_root == workspace.resolve() / "setta_files"
    assert paths.runtime_root == paths.setta_files_root / "runtime"


def test_resolve_setta_paths_strips_workspace_root_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    monkeypatch.setenv("SETTA_WORKSPACE_ROOT", f"  {workspace}  ")

    paths = resolve_setta_paths()

    assert paths.workspace_root == workspace.resolve()


def test_resolve_setta_paths_honors_files_root_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    files_root = tmp_path / "state"

    monkeypatch.setenv("SETTA_FILES_ROOT", str(files_root))

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_root == files_root.resolve()
    assert paths.runtime_root == files_root.resolve() / "runtime"


def test_resolve_setta_paths_uses_files_root_base(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "My Work"
    workspace.mkdir()
    base_root = tmp_path / "state"
    base_root.mkdir()

    paths = resolve_setta_paths(
        workspace_root=workspace,
        files_root_base=base_root,
    )

    expected_hash = hashlib.sha256(
        str(workspace.resolve()).encode("utf-8")
    ).hexdigest()[:8]
    expected_leaf = "My_Work"
    expected = base_root.resolve() / f"{expected_leaf}-{expected_hash}"
    assert paths.setta_files_root == expected


def test_resolve_setta_paths_files_root_base_arg_overrides_files_root_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    env_files_root = tmp_path / "env_state"
    monkeypatch.setenv("SETTA_FILES_ROOT", str(env_files_root))

    base_root = tmp_path / "state_base"
    base_root.mkdir()

    paths = resolve_setta_paths(workspace_root=workspace, files_root_base=base_root)

    assert paths.setta_files_root != env_files_root.resolve()
    assert paths.setta_files_root.parent == base_root.resolve()


def test_resolve_setta_paths_ignore_env_files_root_skips_files_root_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    env_files_root = tmp_path / "env_state"
    monkeypatch.setenv("SETTA_FILES_ROOT", str(env_files_root))

    paths = resolve_setta_paths(workspace_root=workspace, ignore_env_files_root=True)

    assert paths.setta_files_root == workspace.resolve() / "setta_files"


def test_resolve_setta_paths_ignore_env_files_root_still_honors_files_root_base_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    env_files_root = tmp_path / "env_state"
    monkeypatch.setenv("SETTA_FILES_ROOT", str(env_files_root))

    base_root = tmp_path / "state_base"
    base_root.mkdir()
    monkeypatch.setenv("SETTA_FILES_ROOT_BASE", str(base_root))

    paths = resolve_setta_paths(workspace_root=workspace, ignore_env_files_root=True)

    assert paths.setta_files_root != env_files_root.resolve()
    assert paths.setta_files_root.parent == base_root.resolve()


def test_build_files_root_from_base_sanitizes_leaf(tmp_path: Path) -> None:
    workspace = tmp_path / "___"
    workspace.mkdir()
    base_root = tmp_path / "state"
    result = build_files_root_from_base(base_root, workspace)
    assert result.name.startswith("workspace-")


def test_runtime_root_env_override(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    runtime_root = tmp_path / "runtime"
    monkeypatch.setenv("SETTA_RUNTIME_ROOT", str(runtime_root))

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.runtime_root == runtime_root.resolve()


def test_runtime_root_env_override_strips_whitespace(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    runtime_root = tmp_path / "runtime"

    monkeypatch.setenv("SETTA_RUNTIME_ROOT", f"  {runtime_root}  ")

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.runtime_root == runtime_root.resolve()


def test_validate_workspace_root_rejects_missing(tmp_path: Path) -> None:
    missing = tmp_path / "missing"
    with pytest.raises(ValueError):
        validate_workspace_root(missing)


def test_resolve_sessions_root_uses_setta_files_root_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    files_root = tmp_path / "state"
    monkeypatch.setenv("SETTA_FILES_ROOT", str(files_root))

    sessions_root = resolve_sessions_root(workspace)

    assert sessions_root == files_root.resolve() / "runtime" / "sessions"
