import json
import os
from pathlib import Path

from setta.startup_runtime import _apply_paths_to_env
from setta.utils.constants import C
from setta.utils.paths import clear_setta_paths_cache, resolve_setta_paths


def test_apply_paths_to_env_persists_setta_files_location(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    paths = resolve_setta_paths(workspace_root=workspace, setta_files_location="global")

    keys = [
        "SETTA_WORKSPACE_ROOT",
        "SETTA_HOME",
        "SETTA_PROFILE_LOOKUP_HOME",
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
        assert os.environ["SETTA_PROFILE_LOOKUP_HOME"] == str(paths.profile_lookup_home)
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


def test_apply_paths_to_env_clears_profile_auth_cookie_override(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    setta_home = tmp_path / ".setta"
    profile_path = setta_home / "profiles" / "dev.json"
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(
            {
                "name": "dev",
                "workspaceRoot": str(workspace),
                "authCookieName": "cookie_dev",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    paths_with_profile = resolve_setta_paths(
        workspace_root=workspace, setta_home=setta_home, profile="dev"
    )
    paths_without_profile = resolve_setta_paths(
        workspace_root=workspace, setta_home=setta_home
    )

    keys = [
        "SETTA_WORKSPACE_ROOT",
        "SETTA_HOME",
        "SETTA_PROFILE_LOOKUP_HOME",
        "SETTA_FILES_ROOT",
        "SETTA_FILES_LOCATION",
        "SETTA_RUNTIME_ROOT",
        "SETTA_PROFILE",
        "SETTA_AUTH_COOKIE_NAME",
    ]
    previous = {key: os.environ.get(key) for key in keys}
    previous_auth_cookie_name = C.AUTH_COOKIE_NAME
    try:
        for key in keys:
            os.environ.pop(key, None)
        C.AUTH_COOKIE_NAME = "setta_auth"
        clear_setta_paths_cache()

        _apply_paths_to_env(paths_with_profile)
        assert os.environ["SETTA_AUTH_COOKIE_NAME"] == "cookie_dev"
        assert C.AUTH_COOKIE_NAME == "cookie_dev"

        _apply_paths_to_env(paths_without_profile)
        assert "SETTA_AUTH_COOKIE_NAME" not in os.environ
        assert C.AUTH_COOKIE_NAME == previous_auth_cookie_name
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        C.AUTH_COOKIE_NAME = previous_auth_cookie_name
        clear_setta_paths_cache()


def test_apply_paths_to_env_preserves_profile_lookup_home_for_profile_setta_home(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    lookup_home = tmp_path / ".setta"
    runtime_home = tmp_path / ".setta-development"
    profile_path = lookup_home / "profiles" / "dev.json"
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(
            {
                "name": "dev",
                "workspaceRoot": str(workspace),
                "settaHome": str(runtime_home),
                "settaFilesLocation": "local",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    paths = resolve_setta_paths(
        workspace_root=workspace,
        setta_home=lookup_home,
        profile="dev",
    )
    keys = [
        "SETTA_WORKSPACE_ROOT",
        "SETTA_HOME",
        "SETTA_PROFILE_LOOKUP_HOME",
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
        reloaded_paths = resolve_setta_paths()

        assert reloaded_paths.profile_name == "dev"
        assert reloaded_paths.profile_lookup_home == lookup_home.resolve(strict=False)
        assert reloaded_paths.setta_home == runtime_home.resolve(strict=False)
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        clear_setta_paths_cache()
