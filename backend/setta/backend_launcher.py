import logging
import threading
import time
from typing import TYPE_CHECKING

import uvicorn

from setta.logging.config import configure_logging
from setta.utils.constants import C

if TYPE_CHECKING:
    from types import TracebackType

_READY_POLL_INTERVAL_SECONDS = 0.05
_DEFAULT_READY_TIMEOUT_SECONDS = 15.0
_DEFAULT_JOIN_TIMEOUT_SECONDS = 5.0


class BackendServerHandle:
    """Wrap a background uvicorn.Server instance."""

    def __init__(self, server: uvicorn.Server, thread: threading.Thread) -> None:
        self._server = server
        self._thread = thread

    @property
    def server(self) -> uvicorn.Server:
        return self._server

    @property
    def thread(self) -> threading.Thread:
        return self._thread

    def wait_ready(self, timeout: float | None = None) -> bool:
        """Block until uvicorn reports startup complete."""
        deadline = None if timeout is None else time.monotonic() + timeout
        while not self._server.started:
            if not self._thread.is_alive():
                raise RuntimeError("Setta backend exited before startup completed.")
            if deadline is not None and time.monotonic() >= deadline:
                return False
            time.sleep(_READY_POLL_INTERVAL_SECONDS)
        return True

    def stop(self, join_timeout: float | None = None) -> None:
        """Signal the server to exit and wait for the worker thread to finish."""
        if not self._thread.is_alive():
            return
        self._server.should_exit = True
        self._thread.join(join_timeout or _DEFAULT_JOIN_TIMEOUT_SECONDS)
        if self._thread.is_alive():
            self._server.force_exit = True
            self._thread.join(join_timeout or _DEFAULT_JOIN_TIMEOUT_SECONDS)
        if self._thread.is_alive():
            raise RuntimeError("Setta backend thread did not exit cleanly.")

    def is_running(self) -> bool:
        return self._thread.is_alive()

    def __enter__(self) -> "BackendServerHandle":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: "TracebackType | None",
    ) -> None:
        self.stop()


def start_backend(
    *,
    host: str | None = None,
    port: int | None = None,
    log_level: str | int | None = None,
    wait_for_ready: bool = True,
    ready_timeout: float = _DEFAULT_READY_TIMEOUT_SECONDS,
) -> BackendServerHandle:
    """Start the packaged FastAPI backend in a background thread.

    Parameters
    ----------
    host / port:
        Override the bind address (defaults match the CLI).
    log_level:
        Optional logging level override passed to the shared logging bootstrap.
    wait_for_ready:
        When True, block until the server reports startup finished.
    ready_timeout:
        Maximum seconds to wait for readiness when wait_for_ready is True.
    """

    resolved_host = host or C.DEFAULT_HOST
    resolved_port = port or C.DEFAULT_PORT
    C.HOST = resolved_host
    C.PORT = resolved_port

    resolved_level = configure_logging(level_override=log_level)
    uvicorn_level = logging.getLevelName(resolved_level).lower()

    config = uvicorn.Config(
        "setta.server:app",
        host=resolved_host,
        port=resolved_port,
        log_level=uvicorn_level,
        log_config=None,
        timeout_graceful_shutdown=1,
    )
    server = uvicorn.Server(config)

    thread = threading.Thread(
        target=server.run,
        name="setta-backend",
        daemon=True,
    )
    thread.start()

    handle = BackendServerHandle(server, thread)

    if wait_for_ready:
        ready = handle.wait_ready(timeout=ready_timeout)
        if not ready:
            handle.stop()
            raise TimeoutError(
                f"Setta backend did not become ready within {ready_timeout} seconds."
            )

    return handle
