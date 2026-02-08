import hashlib
import json
from pathlib import Path

import pytest

from setta.sessions.utils import resolve_sessions_root
from setta.utils.paths import (
    build_files_root_from_base,
    clear_setta_paths_cache,
    resolve_setta_paths,
    validate_workspace_root,
)


@pytest.fixture(autouse=True)
def _setta_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SETTA_WORKSPACE_ROOT", raising=False)
    monkeypatch.delenv("SETTA_FILES_LOCATION", raising=False)
    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)
    monkeypatch.setenv("SETTA_HOME", str(tmp_path / "setta_home"))
    clear_setta_paths_cache()


def test_resolve_setta_paths_defaults(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.workspace_root == workspace.resolve()
    assert paths.setta_files_location == "local"
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


def test_resolve_setta_paths_honors_files_location_env_global(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    monkeypatch.setenv("SETTA_FILES_LOCATION", "global")

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_location == "global"
    base_root = (tmp_path / "setta_home" / "setta_files").resolve(strict=False)
    expected_root = build_files_root_from_base(base_root, workspace.resolve(strict=False))
    assert paths.setta_files_root == expected_root.resolve(strict=False)
    assert paths.runtime_root == paths.setta_files_root / "runtime"


def test_resolve_setta_paths_auto_uses_global_if_present(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "My Work"
    workspace.mkdir()

    setta_home = tmp_path / "setta_home"
    config_path = setta_home / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(
            {
                "globalSettaFilesBase": str((setta_home / "setta_files").resolve()),
                "openWorkspaceFallback": "use_global_if_present",
                "defaultCreateLocation": "local",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    global_base = (setta_home / "setta_files").resolve()
    global_root = build_files_root_from_base(global_base, workspace).resolve(strict=False)
    global_root.mkdir(parents=True, exist_ok=True)

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_location == "global"
    assert paths.setta_files_root == global_root


def test_local_always_wins_even_when_global_requested(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    local_root = workspace / "setta_files"
    local_root.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("SETTA_FILES_LOCATION", "global")

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_location == "local"
    assert paths.setta_files_root == local_root.resolve(strict=False)


def test_build_files_root_from_base_sanitizes_leaf(tmp_path: Path) -> None:
    workspace = tmp_path / "___"
    workspace.mkdir()
    base_root = tmp_path / "state"
    result = build_files_root_from_base(base_root, workspace)
    assert result.name.startswith("workspace-")


def test_build_files_root_from_base_truncates_long_workspace_names(tmp_path: Path) -> None:
    base_root = tmp_path / "state"
    workspace = tmp_path / ("a" * 200)

    result = build_files_root_from_base(base_root, workspace)

    expected_digest = hashlib.sha256(str(workspace).encode("utf-8")).hexdigest()[:8]
    assert result.name.endswith(f"-{expected_digest}")
    leaf = result.name[: -(len(expected_digest) + 1)]
    assert len(leaf) <= 48


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
    monkeypatch.setenv("SETTA_FILES_LOCATION", "global")

    sessions_root = resolve_sessions_root(workspace)

    base_root = (tmp_path / "setta_home" / "setta_files").resolve(strict=False)
    expected_root = build_files_root_from_base(base_root, workspace.resolve(strict=False))
    assert sessions_root == expected_root.resolve(strict=False) / "runtime" / "sessions"
