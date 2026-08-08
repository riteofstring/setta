import importlib
from pathlib import Path

import pytest
import setta.utils.constants as constants_mod
from tests.helpers.setta_paths import clear_setta_paths_cache


@pytest.fixture(autouse=True)
def _setta_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.chdir(workspace)
    monkeypatch.delenv("SETTA_WORKSPACE_ROOT", raising=False)
    monkeypatch.delenv("SETTA_PROFILE_LOOKUP_HOME", raising=False)
    monkeypatch.delenv("SETTA_PROFILE", raising=False)
    monkeypatch.delenv("SETTA_FILES_ROOT", raising=False)
    monkeypatch.delenv("SETTA_FILES_LOCATION", raising=False)
    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)
    monkeypatch.delenv("SETTA_AUTH_COOKIE_NAME", raising=False)
    monkeypatch.setenv("SETTA_HOME", str(tmp_path / ".setta"))
    clear_setta_paths_cache()
    importlib.reload(constants_mod)


def _reload_constants() -> None:
    clear_setta_paths_cache()
    importlib.reload(constants_mod)


def test_auth_cookie_name_defaults_when_unset() -> None:
    _reload_constants()

    assert constants_mod.C.AUTH_COOKIE_NAME == "setta_auth"


def test_auth_cookie_name_uses_go_sanitized_env_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SETTA_AUTH_COOKIE_NAME", " setta auth ")

    _reload_constants()

    assert constants_mod.C.AUTH_COOKIE_NAME == "setta_auth"
