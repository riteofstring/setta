import logging
import os
import threading
import time
import webbrowser
from pathlib import Path
from typing import TYPE_CHECKING

import uvicorn

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.logging.config import configure_logging
from setta.sessions import SessionMetadata, SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.sessions.utils import resolve_sessions_root
from setta.utils.constants import IS_DEV_MODE, C
from setta.utils.network import build_bootstrap_urls

if TYPE_CHECKING:
    from types import TracebackType

_READY_POLL_INTERVAL_SECONDS = 0.05
_DEFAULT_READY_TIMEOUT_SECONDS = 15.0
_DEFAULT_JOIN_TIMEOUT_SECONDS = 5.0


class BackendServerHandle:
    """Wrap a background uvicorn.Server instance."""

    def __init__(
        self,
        server: uvicorn.Server,
        thread: threading.Thread,
        *,
        session: SessionMetadata | None = None,
        session_registry: SessionRegistry | None = None,
        bootstrap_url_fragment: str | None = None,
        bootstrap_url_plain: str | None = None,
        previous_session_id: str | None = None,
        session_env_updated: bool = False,
        previous_sessions_root: str | None = None,
        sessions_root_env_updated: bool = False,
    ) -> None:
        self._server = server
        self._thread = thread
        self._session = session
        self._session_registry = session_registry
        self._bootstrap_url_fragment = bootstrap_url_fragment
        self._bootstrap_url_plain = bootstrap_url_plain
        self._previous_session_id = previous_session_id
        self._session_env_updated = session_env_updated
        self._previous_sessions_root = previous_sessions_root
        self._sessions_root_env_updated = sessions_root_env_updated

    @property
    def server(self) -> uvicorn.Server:
        return self._server

    @property
    def thread(self) -> threading.Thread:
        return self._thread

    @property
    def session(self) -> SessionMetadata | None:
        return self._session

    @property
    def bootstrap_url_fragment(self) -> str | None:
        return self._bootstrap_url_fragment

    @property
    def bootstrap_url_plain(self) -> str | None:
        return self._bootstrap_url_plain

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
        if self._thread.is_alive():
            self._server.should_exit = True
            self._thread.join(join_timeout or _DEFAULT_JOIN_TIMEOUT_SECONDS)
            if self._thread.is_alive():
                self._server.force_exit = True
                self._thread.join(join_timeout or _DEFAULT_JOIN_TIMEOUT_SECONDS)
            if self._thread.is_alive():
                raise RuntimeError("Setta backend thread did not exit cleanly.")
        if self._session_env_updated:
            if self._previous_session_id is None:
                os.environ.pop(SESSION_ID_ENV_VAR, None)
            else:
                os.environ[SESSION_ID_ENV_VAR] = self._previous_session_id
        if self._sessions_root_env_updated:
            if self._previous_sessions_root is None:
                os.environ.pop(SESSIONS_ROOT_ENV_VAR, None)
            else:
                os.environ[SESSIONS_ROOT_ENV_VAR] = self._previous_sessions_root
        if self._session is not None and self._session_registry is not None:
            self._session_registry.delete_session(self._session.id)

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
    open_browser: bool | str = False,
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
    open_browser:
        When True open the bootstrap URL; when a string, open that URL.
    """

    _ensure_frontend_bundle_available()

    resolved_host = host or C.DEFAULT_HOST
    resolved_port = port or C.DEFAULT_PORT
    C.HOST = resolved_host
    C.PORT = resolved_port

    workspace_root = Path.cwd()
    sessions_root = resolve_sessions_root(workspace_root)
    session_registry = SessionRegistry(sessions_root=sessions_root)
    session = session_registry.create_session(
        workspace_root, resolved_host, resolved_port, os.getpid()
    )
    previous_session_id = os.environ.get(SESSION_ID_ENV_VAR)
    os.environ[SESSION_ID_ENV_VAR] = session.id
    previous_sessions_root = os.environ.get(SESSIONS_ROOT_ENV_VAR)
    os.environ[SESSIONS_ROOT_ENV_VAR] = str(sessions_root)
    secret = session_registry.load_secret(session)
    token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)
    bootstrap_url_fragment, bootstrap_url_plain = build_bootstrap_urls(
        resolved_host, resolved_port, token
    )

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

    handle = BackendServerHandle(
        server,
        thread,
        session=session,
        session_registry=session_registry,
        bootstrap_url_fragment=bootstrap_url_fragment,
        bootstrap_url_plain=bootstrap_url_plain,
        previous_session_id=previous_session_id,
        session_env_updated=True,
        previous_sessions_root=previous_sessions_root,
        sessions_root_env_updated=True,
    )

    if wait_for_ready:
        try:
            ready = handle.wait_ready(timeout=ready_timeout)
        except Exception:
            handle.stop()
            raise
        if not ready:
            handle.stop()
            raise TimeoutError(
                f"Setta backend did not become ready within {ready_timeout} seconds."
            )

    target_url = _resolve_frontend_url(
        open_browser, resolved_host, resolved_port, bootstrap_url_fragment
    )
    if target_url:
        webbrowser.open(target_url)

    return handle


def _resolve_frontend_url(
    open_browser: bool | str,
    host: str,
    port: int,
    bootstrap_url: str | None,
) -> str | None:
    if isinstance(open_browser, str):
        return open_browser
    if open_browser:
        return bootstrap_url or f"http://{host}:{port}"
    return None


def _ensure_frontend_bundle_available() -> None:
    if IS_DEV_MODE:
        return

    static_dir = Path(__file__).resolve().parent / "static" / "frontend"
    if static_dir.exists():
        return
    env_hint = os.environ.get("SETTA_DEV_MODE")
    msg = (
        "Compiled frontend assets are missing at "
        f"{static_dir}. Run `./build.sh` to bundle the UI "
        "or set SETTA_DEV_MODE=true before importing Setta."
    )
    if env_hint:
        msg += f" (SETTA_DEV_MODE={env_hint!r})"
    raise RuntimeError(msg)
