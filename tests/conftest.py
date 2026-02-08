import watchdog.observers
from watchdog.observers.polling import PollingObserver

from tests.utils.watchdog_observer import should_force_polling_observer


# Patch watchdog itself (not Setta modules) so any later `from watchdog.observers import Observer`
# bindings pick up polling without importing Setta early (which can freeze `setta.utils.constants.CWD`).
if should_force_polling_observer():
    watchdog.observers.Observer = PollingObserver

