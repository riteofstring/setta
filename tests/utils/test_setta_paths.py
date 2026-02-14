import hashlib
import json
import os
from pathlib import Path

import pytest

from setta.database.db_objs import DBE
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
    monkeypatch.delenv("SETTA_PROFILE_LOOKUP_HOME", raising=False)
    monkeypatch.delenv("SETTA_PROFILE", raising=False)
    monkeypatch.delenv("SETTA_FILES_ROOT", raising=False)
    monkeypatch.delenv("SETTA_FILES_LOCATION", raising=False)
    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)
    monkeypatch.setenv("SETTA_HOME", str(tmp_path / ".setta"))
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


def test_resolve_setta_paths_rejects_nonstandard_setta_home_name(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    with pytest.raises(ValueError, match=r"must end with one of"):
        resolve_setta_paths(
            workspace_root=workspace,
            setta_home=tmp_path / "setta_home_custom",
        )


def test_resolve_setta_paths_honors_files_location_env_global(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    monkeypatch.setenv("SETTA_FILES_LOCATION", "global")

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_location == "global"
    base_root = (tmp_path / ".setta" / "setta_files").resolve(strict=False)
    expected_root = build_files_root_from_base(
        base_root, workspace.resolve(strict=False)
    )
    assert paths.setta_files_root == expected_root.resolve(strict=False)
    assert paths.runtime_root == paths.setta_files_root / "runtime"


def test_resolve_setta_paths_strips_files_location_env_whitespace(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    monkeypatch.setenv("SETTA_FILES_LOCATION", "  GLOBAL  ")

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_location == "global"
    base_root = (tmp_path / ".setta" / "setta_files").resolve(strict=False)
    expected_root = build_files_root_from_base(
        base_root, workspace.resolve(strict=False)
    )
    assert paths.setta_files_root == expected_root.resolve(strict=False)


def test_resolve_setta_paths_rejects_invalid_files_location_env(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    monkeypatch.setenv("SETTA_FILES_LOCATION", "nope")

    with pytest.raises(ValueError, match=r"Invalid setta files location"):
        resolve_setta_paths(workspace_root=workspace)


def test_resolve_setta_paths_rejects_invalid_files_location_override(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    with pytest.raises(ValueError, match=r"Invalid setta files location"):
        resolve_setta_paths(workspace_root=workspace, setta_files_location="nope")


def test_resolve_setta_paths_normalizes_files_location_override_case_and_whitespace(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    paths = resolve_setta_paths(
        workspace_root=workspace,
        setta_files_location="  GLOBAL  ",
    )

    assert paths.setta_files_location == "global"
    base_root = (tmp_path / ".setta" / "setta_files").resolve(strict=False)
    expected_root = build_files_root_from_base(
        base_root, workspace.resolve(strict=False)
    )
    assert paths.setta_files_root == expected_root.resolve(strict=False)


def test_resolve_setta_paths_rejects_local_root_that_is_file(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    (workspace / "setta_files").write_text("nope", encoding="utf-8")

    with pytest.raises(ValueError, match=r"Local setta_files path is not a directory"):
        resolve_setta_paths(workspace_root=workspace)


def test_explicit_setta_files_root_bypasses_invalid_local_root_file(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "setta_files").write_text("invalid", encoding="utf-8")
    explicit_root = tmp_path / "explicit_state_root" / "setta_files_dev"

    paths = resolve_setta_paths(
        workspace_root=workspace,
        setta_files_root=explicit_root,
    )

    assert paths.setta_files_root == explicit_root.resolve(strict=False)
    assert paths.setta_files_location is None


def test_resolve_setta_paths_rejects_setta_files_root_without_allowed_folder_name(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    with pytest.raises(
        ValueError, match=r"Setta files root must include one of these folder names"
    ):
        resolve_setta_paths(
            workspace_root=workspace,
            setta_files_root=tmp_path / "state_root_custom",
        )


def test_resolve_setta_paths_rejects_global_root_that_is_file(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    global_base = (setta_home / "setta_files").resolve(strict=False)
    global_root = build_files_root_from_base(global_base, workspace).resolve(
        strict=False
    )
    global_root.parent.mkdir(parents=True, exist_ok=True)
    global_root.write_text("nope", encoding="utf-8")

    with pytest.raises(ValueError, match=r"Global setta_files path is not a directory"):
        resolve_setta_paths(workspace_root=workspace, setta_files_location="global")


def test_resolve_setta_paths_auto_uses_global_if_present(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "My Work"
    workspace.mkdir()

    setta_home = tmp_path / ".setta"
    config_path = setta_home / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(
            {
                "globalSettaFilesBase": str((setta_home / "setta_files").resolve()),
                "autoMode": "use_global_if_present",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    global_base = (setta_home / "setta_files").resolve()
    global_root = build_files_root_from_base(global_base, workspace).resolve(
        strict=False
    )
    global_root.mkdir(parents=True, exist_ok=True)

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_location == "global"
    assert paths.setta_files_root == global_root


def test_resolve_setta_paths_auto_uses_local_when_global_missing(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    config_path = setta_home / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(
            {
                "globalSettaFilesBase": str((setta_home / "setta_files").resolve()),
                "autoMode": "use_global_if_present",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    global_base = (setta_home / "setta_files").resolve()
    global_root = build_files_root_from_base(global_base, workspace).resolve(
        strict=False
    )
    assert not global_root.exists()

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_location == "local"
    assert paths.setta_files_root == (workspace / "setta_files").resolve(strict=False)
    assert not paths.setta_files_root.exists()


def test_resolve_setta_paths_auto_create_global_selects_global(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    config_path = setta_home / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(
            {
                "globalSettaFilesBase": str((setta_home / "setta_files").resolve()),
                "autoMode": "create_global",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    global_base = (setta_home / "setta_files").resolve()
    expected_global_root = build_files_root_from_base(global_base, workspace).resolve(
        strict=False
    )
    assert not expected_global_root.exists()

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_location == "global"
    assert paths.setta_files_root == expected_global_root
    assert not paths.setta_files_root.exists()

    DBE(paths.setta_files_root)
    assert paths.setta_files_root.is_dir()


def test_resolve_setta_paths_explicit_local_creates_root_with_dbe(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    paths = resolve_setta_paths(workspace_root=workspace, setta_files_location="local")

    assert paths.setta_files_location == "local"
    assert paths.setta_files_root == (workspace / "setta_files").resolve(strict=False)
    assert not paths.setta_files_root.exists()

    DBE(paths.setta_files_root)
    assert paths.setta_files_root.is_dir()


def test_resolve_setta_paths_explicit_global_creates_root_with_dbe(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    global_base = (setta_home / "setta_files").resolve(strict=False)
    expected_global_root = build_files_root_from_base(global_base, workspace).resolve(
        strict=False
    )
    assert not expected_global_root.exists()

    paths = resolve_setta_paths(workspace_root=workspace, setta_files_location="global")

    assert paths.setta_files_location == "global"
    assert paths.setta_files_root == expected_global_root
    assert not (workspace / "setta_files").exists()

    DBE(paths.setta_files_root)
    assert paths.setta_files_root.is_dir()
    assert not (workspace / "setta_files").exists()


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


def test_build_files_root_from_base_truncates_long_workspace_names(
    tmp_path: Path,
) -> None:
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


@pytest.mark.parametrize(
    ("raw_path", "expected_path"),
    [
        ("~/state_from_tilde/setta_files", ("state_from_tilde", "setta_files")),
        ("$HOME/state_from_env/setta_files_dev", ("state_from_env", "setta_files_dev")),
    ],
)
def test_setta_files_root_path_inputs_expand_user_and_env_vars(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    raw_path: str,
    expected_path: tuple[str, str],
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    home = tmp_path / "home"
    home.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("HOME", str(home))

    paths = resolve_setta_paths(
        workspace_root=workspace,
        setta_files_root=Path(raw_path),
    )

    assert paths.setta_files_root == (home / expected_path[0] / expected_path[1]).resolve(
        strict=False
    )


@pytest.mark.parametrize(
    ("raw_path", "expected_leaf"),
    [
        ("~/runtime_from_tilde", "runtime_from_tilde"),
        ("$HOME/runtime_from_env", "runtime_from_env"),
    ],
)
def test_runtime_root_path_inputs_expand_user_and_env_vars(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, raw_path: str, expected_leaf: str
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    home = tmp_path / "home"
    home.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("HOME", str(home))

    paths = resolve_setta_paths(
        workspace_root=workspace,
        runtime_root=Path(raw_path),
    )

    assert paths.runtime_root == (home / expected_leaf).resolve(strict=False)


def test_runtime_root_env_override_strips_whitespace(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    runtime_root = tmp_path / "runtime"

    monkeypatch.setenv("SETTA_RUNTIME_ROOT", f"  {runtime_root}  ")

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.runtime_root == runtime_root.resolve()


def test_resolve_setta_paths_rejects_runtime_root_matching_workspace(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    with pytest.raises(ValueError, match=r"Runtime root cannot be the workspace root"):
        resolve_setta_paths(
            workspace_root=workspace,
            runtime_root=workspace,
        )


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

    base_root = (tmp_path / ".setta" / "setta_files").resolve(strict=False)
    expected_root = build_files_root_from_base(
        base_root, workspace.resolve(strict=False)
    )
    assert sessions_root == expected_root.resolve(strict=False) / "runtime" / "sessions"


def test_explicit_setta_files_root_overrides_local_root(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "setta_files").mkdir(parents=True, exist_ok=True)
    explicit_root = tmp_path / "explicit_state_root" / "setta_files_dev"

    paths = resolve_setta_paths(
        workspace_root=workspace,
        setta_files_root=explicit_root,
    )

    assert paths.setta_files_root == explicit_root.resolve(strict=False)
    assert paths.setta_files_location is None


def test_env_setta_files_root_overrides_local_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "setta_files").mkdir(parents=True, exist_ok=True)
    explicit_root = tmp_path / "explicit_state_root" / "setta_files_dev"
    monkeypatch.setenv("SETTA_FILES_ROOT", str(explicit_root))

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.setta_files_root == explicit_root.resolve(strict=False)
    assert paths.setta_files_location is None


def test_rejects_conflicting_explicit_setta_files_root_and_location(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    explicit_root = tmp_path / "explicit_state_root" / "setta_files_dev"

    with pytest.raises(ValueError, match="--setta-files-root"):
        resolve_setta_paths(
            workspace_root=workspace,
            setta_files_root=explicit_root,
            setta_files_location="local",
        )


def test_rejects_conflicting_env_setta_files_root_and_location(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.setenv(
        "SETTA_FILES_ROOT", str(tmp_path / "explicit_state_root" / "setta_files_dev")
    )
    monkeypatch.setenv("SETTA_FILES_LOCATION", "global")

    with pytest.raises(ValueError, match="SETTA_FILES_ROOT"):
        resolve_setta_paths(workspace_root=workspace)


def test_profile_overrides_env_for_files_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    profiles_dir = setta_home / "profiles"
    profiles_dir.mkdir(parents=True, exist_ok=True)
    profile_root = tmp_path / "profile_state_root" / "setta_files"
    env_root = tmp_path / "env_state_root" / "setta_files_dev"
    monkeypatch.setenv("SETTA_FILES_ROOT", str(env_root))

    (profiles_dir / "dev.json").write_text(
        json.dumps(
            {
                "name": "dev",
                "settaFilesRoot": str(profile_root),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    clear_setta_paths_cache()

    paths = resolve_setta_paths(workspace_root=workspace, profile="dev")

    assert paths.profile_name == "dev"
    assert paths.setta_files_root == profile_root.resolve(strict=False)
    assert paths.setta_files_location is None


def test_explicit_location_overrides_profile_setta_files_root(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    profiles_dir = setta_home / "profiles"
    profiles_dir.mkdir(parents=True, exist_ok=True)
    profile_root = tmp_path / "profile_state_root" / "setta_files"

    (profiles_dir / "dev.json").write_text(
        json.dumps(
            {
                "name": "dev",
                "settaFilesRoot": str(profile_root),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    clear_setta_paths_cache()

    paths = resolve_setta_paths(
        workspace_root=workspace,
        profile="dev",
        setta_files_location="local",
    )

    assert paths.setta_files_location == "local"
    assert paths.setta_files_root == (workspace / "setta_files").resolve(strict=False)


def test_profile_lookup_home_env_keeps_profile_lookup_stable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    profile_lookup_home = tmp_path / ".setta"
    profile_runtime_home = tmp_path / ".setta-development"
    profile_path = profile_lookup_home / "profiles" / "dev.json"
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(
            {
                "name": "dev",
                "workspaceRoot": str(workspace),
                "settaHome": str(profile_runtime_home),
                "settaFilesLocation": "local",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    monkeypatch.setenv("SETTA_PROFILE", "dev")
    monkeypatch.setenv("SETTA_HOME", str(profile_runtime_home))
    monkeypatch.setenv("SETTA_PROFILE_LOOKUP_HOME", str(profile_lookup_home))

    paths = resolve_setta_paths()

    assert paths.profile_name == "dev"
    assert paths.profile_lookup_home == profile_lookup_home.resolve(strict=False)
    assert paths.setta_home == profile_runtime_home.resolve(strict=False)
    assert paths.workspace_root == workspace.resolve(strict=False)


def test_profile_lookup_home_uses_setta_home_when_profile_not_selected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    lookup_home = tmp_path / ".setta-development"
    setta_home = tmp_path / ".setta"

    monkeypatch.setenv("SETTA_HOME", str(setta_home))
    monkeypatch.setenv("SETTA_PROFILE_LOOKUP_HOME", str(lookup_home))

    paths = resolve_setta_paths(workspace_root=workspace)

    assert paths.profile_name is None
    assert paths.profile_lookup_home == setta_home.resolve(strict=False)
    assert paths.setta_home == setta_home.resolve(strict=False)


def test_unknown_profile_raises(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    with pytest.raises(ValueError, match="Unknown Setta profile"):
        resolve_setta_paths(workspace_root=workspace, profile="missing")
