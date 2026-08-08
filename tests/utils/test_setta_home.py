import sys
from pathlib import Path

import pytest

from setta.utils.setta_home import resolve_setta_home, resolve_setta_user_config_path


def test_resolve_setta_home_honors_env_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    override = tmp_path / "custom_home"
    monkeypatch.setenv("SETTA_HOME", f"  {override}  ")

    assert resolve_setta_home() == override.resolve(strict=False)


def test_resolve_setta_home_can_ignore_env_override(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    override = tmp_path / "custom_home"
    fake_home_root = tmp_path / "home"
    monkeypatch.setenv("SETTA_HOME", f"  {override}  ")
    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: fake_home_root))
    monkeypatch.setattr(sys, "platform", "linux")

    assert resolve_setta_home(allow_env_override=False) == (
        fake_home_root / ".setta"
    ).resolve(strict=False)


def test_resolve_setta_home_expands_env_vars(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    base = tmp_path / "base"
    monkeypatch.setenv("SETTA_HOME_BASE", str(base))
    monkeypatch.setenv("SETTA_HOME", "$SETTA_HOME_BASE/subdir")

    assert resolve_setta_home() == (base / "subdir").resolve(strict=False)


def test_resolve_setta_home_win32_uses_appdata(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SETTA_HOME", raising=False)
    monkeypatch.setattr(sys, "platform", "win32")
    appdata = tmp_path / "AppData" / "Roaming"
    monkeypatch.setenv("APPDATA", str(appdata))

    assert resolve_setta_home() == (appdata / ".setta").resolve(strict=False)


def test_resolve_setta_home_win32_falls_back_when_appdata_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("SETTA_HOME", raising=False)
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setenv("APPDATA", "")

    fake_home_root = tmp_path / "home"

    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: fake_home_root))

    assert resolve_setta_home() == (
        fake_home_root / "AppData" / "Roaming" / ".setta"
    ).resolve(strict=False)


def test_resolve_setta_home_unix_uses_dot_setta(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SETTA_HOME", raising=False)
    monkeypatch.setattr(sys, "platform", "linux")

    fake_home_root = tmp_path / "home"

    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: fake_home_root))

    assert resolve_setta_home() == (fake_home_root / ".setta").resolve(strict=False)


def test_resolve_setta_user_config_path_appends_config_json(tmp_path: Path) -> None:
    assert resolve_setta_user_config_path(setta_home=tmp_path) == tmp_path / "config.json"
