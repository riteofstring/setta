import sys

from watchdog.observers.polling import PollingObserver

import setta.file_watchers.lsp as lsp_file_watcher
import setta.file_watchers.specific_file_watcher as specific_file_watcher
import setta.project_state.watch_code as watch_code


if sys.platform == "darwin":
    # Avoid watchdog FSEvents crashes during test teardown on macOS by using a
    # polling observer for all filesystem watchers.
    specific_file_watcher.Observer = PollingObserver
    lsp_file_watcher.Observer = PollingObserver
    watch_code.Observer = PollingObserver

