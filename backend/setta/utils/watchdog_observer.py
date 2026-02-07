import os

from watchdog.observers import Observer
from watchdog.observers.polling import PollingObserver

_FORCE_POLLING_ENV_VAR = "SETTA_WATCHDOG_FORCE_POLLING"


def build_watchdog_observer():
    """Build a watchdog observer.

    Default behavior matches watchdog's platform selection (FSEvents on macOS,
    inotify on Linux, etc). In some restricted environments FSEvents streams
    cannot start; tests can force the polling observer via env var.
    """

    if os.environ.get(_FORCE_POLLING_ENV_VAR):
        return PollingObserver()
    return Observer()
