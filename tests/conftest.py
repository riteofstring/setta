import os
import sys

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


@pytest.fixture(scope="session")
def _setta_paths_env_baseline() -> dict[str, str | None]:
    return {key: os.environ.get(key) for key in _SETTA_PATH_ENV_VARS}


@pytest.fixture(autouse=True)
def _reset_setta_paths_env(
    _setta_paths_env_baseline: dict[str, str | None],
) -> None:
    # Ensure path env vars don't leak across tests, and that get_setta_paths() is
    # recalculated after any env changes.
    for key, value in _setta_paths_env_baseline.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value

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
