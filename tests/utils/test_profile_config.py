import json
import os
from pathlib import Path

import pytest

from setta.utils.profile_config import (
    clear_setta_profile_config_cache,
    load_setta_profile,
    resolve_setta_profile_path,
)


def test_load_profile_not_found_raises() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    clear_setta_profile_config_cache()
    with pytest.raises(ValueError, match="Unknown Setta profile"):
        load_setta_profile(profile="missing", setta_home=setta_home)


def test_load_profile_parses_optional_fields(tmp_path: Path) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    profile_path = resolve_setta_profile_path(setta_home=setta_home, profile="dev")
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(
            {
                "name": "dev",
                "workspaceRoot": str(tmp_path / "workspace"),
                "settaHome": str(tmp_path / "setta_home_dev"),
                "settaFilesRoot": str(tmp_path / "state_dev"),
                "runtimeRoot": str(tmp_path / "runtime_dev"),
                "authCookieName": "setta_auth_dev",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    clear_setta_profile_config_cache()
    profile = load_setta_profile(profile="dev", setta_home=setta_home)

    assert profile.name == "dev"
    assert profile.workspace_root == (tmp_path / "workspace").resolve(strict=False)
    assert profile.setta_home == (tmp_path / "setta_home_dev").resolve(strict=False)
    assert profile.setta_files_root == (tmp_path / "state_dev").resolve(strict=False)
    assert profile.runtime_root == (tmp_path / "runtime_dev").resolve(strict=False)
    assert profile.auth_cookie_name == "setta_auth_dev"
    assert profile.setta_files_location is None


def test_load_profile_rejects_conflicting_setta_files_fields(tmp_path: Path) -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    profile_path = resolve_setta_profile_path(setta_home=setta_home, profile="dev")
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(
            {
                "name": "dev",
                "settaFilesRoot": str(tmp_path / "state_dev"),
                "settaFilesLocation": "global",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    clear_setta_profile_config_cache()
    with pytest.raises(ValueError, match="settaFilesRoot and settaFilesLocation"):
        load_setta_profile(profile="dev", setta_home=setta_home)


def test_load_profile_rejects_invalid_name_in_payload() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    profile_path = resolve_setta_profile_path(setta_home=setta_home, profile="dev")
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps({"name": "different"}, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    clear_setta_profile_config_cache()
    with pytest.raises(ValueError, match="Profile name mismatch"):
        load_setta_profile(profile="dev", setta_home=setta_home)


def test_resolve_setta_profile_path_rejects_invalid_profile_name() -> None:
    setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
    with pytest.raises(ValueError, match="Invalid profile name"):
        resolve_setta_profile_path(setta_home=setta_home, profile="../dev")
