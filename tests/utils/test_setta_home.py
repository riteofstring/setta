from pathlib import Path
from types import SimpleNamespace

import pytest

from setta.utils import setta_home as setta_home_module
from setta.utils.setta_home import resolve_setta_home


def test_resolve_setta_home_delegates_to_go_path_resolution(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    resolved_home = tmp_path / "custom_home"
    captured_kwargs: dict[str, object] = {}

    def fake_resolve_setta_paths(**kwargs: object) -> SimpleNamespace:
        captured_kwargs.update(kwargs)
        return SimpleNamespace(setta_home=resolved_home.resolve(strict=False))

    monkeypatch.setattr(setta_home_module, "resolve_setta_paths", fake_resolve_setta_paths)

    assert resolve_setta_home() == resolved_home.resolve(strict=False)
    assert captured_kwargs == {
        "allow_env_files_overrides": False,
        "allow_env_non_files_overrides": True,
        "allow_profile_env_overrides": False,
    }


def test_resolve_setta_home_can_disable_env_override_delegation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    resolved_home = tmp_path / "custom_home"
    captured_kwargs: dict[str, object] = {}

    def fake_resolve_setta_paths(**kwargs: object) -> SimpleNamespace:
        captured_kwargs.update(kwargs)
        return SimpleNamespace(setta_home=resolved_home.resolve(strict=False))

    monkeypatch.setattr(setta_home_module, "resolve_setta_paths", fake_resolve_setta_paths)

    assert resolve_setta_home(allow_env_override=False) == resolved_home.resolve(
        strict=False
    )
    assert captured_kwargs == {
        "allow_env_files_overrides": False,
        "allow_env_non_files_overrides": False,
        "allow_profile_env_overrides": False,
    }
