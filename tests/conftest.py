import sys

import pytest


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

