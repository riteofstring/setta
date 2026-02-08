import os
import sys

import pytest

from setta.utils.paths import clear_setta_paths_cache

_SETTA_PATH_ENV_VARS = (
    "SETTA_WORKSPACE_ROOT",
    "SETTA_FILES_ROOT",
    "SETTA_FILES_ROOT_BASE",
    "SETTA_RUNTIME_ROOT",
)


@pytest.fixture(autouse=True)
def _force_polling_watchdog_observer_on_darwin(monkeypatch: pytest.MonkeyPatch) -> None:
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
def _reset_setta_paths_env(_setta_paths_env_baseline: dict[str, str | None]) -> None:
    # Ensure path env vars don't leak across tests, and that get_setta_paths() is
    # recalculated after any env changes.
    for key, value in _setta_paths_env_baseline.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    clear_setta_paths_cache()
