import os
import sys
from pathlib import Path

import pytest
import watchdog.observers
from watchdog.observers.polling import PollingObserver

from tests.utils.watchdog_observer import should_force_polling_observer


# Patch watchdog itself (not Setta modules) so any later
# `from watchdog.observers import Observer` bindings pick up polling without
# importing Setta early.
if should_force_polling_observer():
    watchdog.observers.Observer = PollingObserver


_SETTA_PATH_ENV_VARS = (
    "SETTA_WORKSPACE_ROOT",
    "SETTA_HOME",
    "SETTA_PROFILE",
    "SETTA_FILES_ROOT",
    "SETTA_FILES_LOCATION",
    "SETTA_RUNTIME_ROOT",
    "SETTA_AUTH_COOKIE_NAME",
)


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


@pytest.fixture(scope="session", autouse=True)
def _guard_setta_home_resolution_to_tmp_roots(
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    from setta.utils import setta_home as setta_home_module

    original_resolve_setta_home = setta_home_module.resolve_setta_home
    pytest_temp_root = tmp_path_factory.getbasetemp().resolve(strict=False)

    def guarded_resolve_setta_home() -> Path:
        resolved = original_resolve_setta_home().resolve(strict=False)
        if not _is_relative_to(resolved, pytest_temp_root):
            raise AssertionError(
                "SETTA_HOME resolved outside pytest temp roots. "
                f"resolved={resolved} allowed_root={pytest_temp_root}"
            )
        return resolved

    patched_targets: list[tuple[object, str]] = []

    # Patch the canonical function first so any later imports pick up the guard.
    setta_home_module.resolve_setta_home = guarded_resolve_setta_home
    patched_targets.append((setta_home_module, "resolve_setta_home"))

    # Also patch already-imported aliases from `from ... import resolve_setta_home`.
    for module in list(sys.modules.values()):
        if module is None:
            continue
        if getattr(module, "resolve_setta_home", None) is original_resolve_setta_home:
            setattr(module, "resolve_setta_home", guarded_resolve_setta_home)
            patched_targets.append((module, "resolve_setta_home"))

    try:
        yield
    finally:
        for module, attr in reversed(patched_targets):
            setattr(module, attr, original_resolve_setta_home)


@pytest.fixture(autouse=True)
def _force_polling_watchdog_observer_on_darwin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Avoid FSEvents flakiness in restricted macOS environments.

    The production default remains watchdog's platform selection. Tests force the
    polling observer on macOS so repeated observer startup/shutdown doesn't
    trigger hard failures in sandboxed runners.
    """

    if sys.platform != "darwin":
        return
    monkeypatch.setenv("SETTA_WATCHDOG_FORCE_POLLING", "1")


@pytest.fixture(autouse=True)
def _reset_setta_paths_env() -> None:
    # Ensure path env vars don't leak across tests and avoid host shell settings
    # (for example, both SETTA_FILES_ROOT and SETTA_FILES_LOCATION) changing test
    # behavior.
    for key in _SETTA_PATH_ENV_VARS:
        os.environ.pop(key, None)

    from setta.utils.paths import clear_setta_paths_cache

    clear_setta_paths_cache()


@pytest.fixture(autouse=True)
def _setta_home_tmp(
    _reset_setta_paths_env: None,
    tmp_path_factory: pytest.TempPathFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Ensure tests never touch a real user config directory (for example ~/.setta or
    # %APPDATA%\\Setta). Individual tests can override SETTA_HOME explicitly.
    monkeypatch.setenv("SETTA_HOME", str(tmp_path_factory.mktemp("setta_home")))
    from setta.utils.paths import clear_setta_paths_cache

    clear_setta_paths_cache()
