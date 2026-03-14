import logging
import os
import signal
import socket
import subprocess
import time
import webbrowser
from pathlib import Path
from typing import TYPE_CHECKING

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.entrypoint import resolve_source_checkout_root, validate_executable_path
from setta.logging.config import configure_logging
from setta.sessions import SessionMetadata, SessionRegistry
from setta.sessions.constants import (
    IN_PROCESS_ENV_VAR,
    SESSION_ID_ENV_VAR,
    SESSIONS_ROOT_ENV_VAR,
)
from setta.utils.constants import IS_DEV_MODE, C
from setta.utils.env_vars import (
    FILES_LOCATION_ENV,
    FILES_ROOT_ENV,
    PROFILE_ENV,
    PROFILE_LOOKUP_HOME_ENV,
    RUNTIME_ROOT_ENV,
    SETTA_HOME_ENV,
    WORKSPACE_ROOT_ENV,
)
from setta.utils.network import build_bootstrap_urls
from setta.utils.paths import clear_setta_paths_cache, get_setta_paths

if TYPE_CHECKING:
    from types import TracebackType

_GO_SERVER_BINARY_OVERRIDE_ENV = "SETTA_SERVER_BIN"
_SOURCE_CHECKOUT_SERVER_WRAPPER = Path("scripts") / "run_setta_server.sh"
_READY_POLL_INTERVAL_SECONDS = 0.05
_DEFAULT_READY_TIMEOUT_SECONDS = 15.0
_DEFAULT_JOIN_TIMEOUT_SECONDS = 5.0


class BackendServerHandle:
    """Wrap a background Go Setta server process."""

    def __init__(
        self,
        process: subprocess.Popen[str],
        *,
        session_registry: SessionRegistry,
        workspace_root: Path,
        host: str,
        port: int,
        bootstrap_url_fragment: str | None = None,
        bootstrap_url_plain: str | None = None,
    ) -> None:
        self._process = process
        self._session_registry = session_registry
        self._workspace_root = workspace_root
        self._host = host
        self._port = port
        self._session: SessionMetadata | None = None
        self._bootstrap_url_fragment = bootstrap_url_fragment
        self._bootstrap_url_plain = bootstrap_url_plain

    @property
    def process(self) -> subprocess.Popen[str]:
        return self._process

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
        """Block until the server listens and writes its local session metadata."""
        deadline = None if timeout is None else time.monotonic() + timeout
        while True:
            return_code = self._process.poll()
            if return_code is not None:
                output = ""
                if self._process.stdout is not None:
                    output = self._process.stdout.read()
                detail = f"Setta backend exited before startup completed (exit {return_code})."
                if output:
                    detail = f"{detail}\n{output}"
                raise RuntimeError(detail)
            port_ready = _is_tcp_port_ready(self._host, self._port)
            session_ready = self._refresh_session_metadata()
            if port_ready and session_ready:
                return True
            if deadline is not None and time.monotonic() >= deadline:
                return False
            time.sleep(_READY_POLL_INTERVAL_SECONDS)

    def stop(self, join_timeout: float | None = None) -> None:
        """Signal the server to exit and wait for the process to finish."""
        timeout = join_timeout or _DEFAULT_JOIN_TIMEOUT_SECONDS
        if self._process.poll() is None:
            if os.name == "nt":
                self._process.terminate()
            else:
                self._process.send_signal(signal.SIGINT)
            try:
                self._process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait(timeout=timeout)
        if self._session is not None:
            self._session_registry.delete_session(self._session.id)
        if self._process.stdout is not None:
            self._process.stdout.close()

    def is_running(self) -> bool:
        return self._process.poll() is None

    def __enter__(self) -> "BackendServerHandle":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: "TracebackType | None",
    ) -> None:
        self.stop()

    def _refresh_session_metadata(self) -> bool:
        sessions = self._session_registry.find_sessions_by_workspace(
            self._workspace_root,
            prune_stale=False,
        )
        matching = [
            session
            for session in sessions
            if session.host == self._host
            and session.port == self._port
            and session.serverMode == "ide"
        ]
        if not matching:
            return False
        matching.sort(key=lambda session: session.startedAt, reverse=True)
        session = matching[0]
        self._session = session
        secret = self._session_registry.load_secret(session)
        (
            self._bootstrap_url_fragment,
            self._bootstrap_url_plain,
        ) = build_bootstrap_urls(
            self._host, self._port, BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)
        )
        return True


def start_backend(
    *,
    host: str | None = None,
    port: int | None = None,
    log_level: str | int | None = None,
    wait_for_ready: bool = True,
    ready_timeout: float = _DEFAULT_READY_TIMEOUT_SECONDS,
    open_browser: bool | str = False,
    ws_protocol: str | None = None,
) -> BackendServerHandle:
    """Start the Go backend in a background process.

    Parameters
    ----------
    host / port:
        Override the bind address (defaults match the CLI).
    log_level:
        Optional logging level override passed through to the server command.
    wait_for_ready:
        When True, block until the server listens and session metadata exists.
    ready_timeout:
        Maximum seconds to wait for readiness when wait_for_ready is True.
    open_browser:
        When True open the bootstrap URL; when a string, open that URL.
    ws_protocol:
        Retained for compatibility with callers that previously configured
        uvicorn. The Go server ignores this setting.
    """

    _ensure_frontend_bundle_available()
    clear_setta_paths_cache()
    paths = get_setta_paths()
    session_registry = SessionRegistry(sessions_root=paths.runtime_sessions_root)

    resolved_host = host or C.DEFAULT_HOST
    resolved_port = C.DEFAULT_PORT if port is None else port
    C.HOST = resolved_host
    C.PORT = resolved_port

    resolved_level = configure_logging(level_override=log_level)
    child_log_level = logging.getLevelName(resolved_level).lower()
    if child_log_level == "warning":
        child_log_level = "warn"

    command, command_cwd = resolve_go_server_command()
    args = [
        *command,
        "--mode",
        "ide",
        "--host",
        resolved_host,
        "--port",
        str(resolved_port),
        "--workspace",
        str(paths.workspace_root),
        "--setta-home",
        str(paths.setta_home),
        "--profile-lookup-home",
        str(paths.profile_lookup_home),
        "--runtime-root",
        str(paths.runtime_root),
        "--no-open",
        "--log-level",
        child_log_level,
    ]
    if paths.profile_name:
        args.extend(["--profile", paths.profile_name])
    if paths.setta_files_location is None:
        args.extend(["--setta-files-root", str(paths.setta_files_root)])
    else:
        args.extend(["--setta-files-location", paths.setta_files_location])

    process = subprocess.Popen(
        args,
        cwd=command_cwd,
        env=build_backend_launcher_env(paths),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    handle = BackendServerHandle(
        process,
        session_registry=session_registry,
        workspace_root=paths.workspace_root,
        host=resolved_host,
        port=resolved_port,
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
        open_browser,
        resolved_host,
        resolved_port,
        handle.bootstrap_url_fragment,
    )
    if target_url:
        webbrowser.open(target_url)

    return handle


def resolve_go_server_command() -> tuple[list[str], Path | None]:
    override = os.environ.get(_GO_SERVER_BINARY_OVERRIDE_ENV, "").strip()
    if override:
        binary = validate_executable_path(
            Path(override),
            f"{_GO_SERVER_BINARY_OVERRIDE_ENV} points to a missing or invalid executable",
        )
        return [str(binary)], None

    package_root = Path(__file__).resolve(strict=False).parent
    source_checkout_root = resolve_source_checkout_root(package_root)
    if source_checkout_root is not None:
        wrapper = validate_executable_path(
            source_checkout_root / _SOURCE_CHECKOUT_SERVER_WRAPPER,
            "Source checkout Go server wrapper is missing or invalid",
        )
        return [str(wrapper)], source_checkout_root

    binary_name = "setta-server.exe" if os.name == "nt" else "setta-server"
    candidate = package_root / "go_bin" / binary_name
    binary = validate_executable_path(
        candidate,
        "Packaged Go Setta server binary was not found. Rebuild the distribution with build.sh or install an official packaged release.",
    )
    return [str(binary)], None


def build_backend_launcher_env(paths) -> dict[str, str]:
    env = dict(os.environ)
    env[WORKSPACE_ROOT_ENV] = str(paths.workspace_root)
    env[SETTA_HOME_ENV] = str(paths.setta_home)
    env[PROFILE_LOOKUP_HOME_ENV] = str(paths.profile_lookup_home)
    env[RUNTIME_ROOT_ENV] = str(paths.runtime_root)
    if paths.profile_name:
        env[PROFILE_ENV] = paths.profile_name
    else:
        env.pop(PROFILE_ENV, None)
    if paths.setta_files_location is None:
        env[FILES_ROOT_ENV] = str(paths.setta_files_root)
        env.pop(FILES_LOCATION_ENV, None)
    else:
        env[FILES_LOCATION_ENV] = paths.setta_files_location
        env.pop(FILES_ROOT_ENV, None)
    if paths.auth_cookie_name:
        env["SETTA_AUTH_COOKIE_NAME"] = paths.auth_cookie_name
    else:
        env.pop("SETTA_AUTH_COOKIE_NAME", None)
    if IS_DEV_MODE:
        env["SETTA_DEV_MODE"] = str(IS_DEV_MODE)
    else:
        env.pop("SETTA_DEV_MODE", None)
    env.pop(SESSION_ID_ENV_VAR, None)
    env.pop(SESSIONS_ROOT_ENV_VAR, None)
    env.pop(IN_PROCESS_ENV_VAR, None)
    return env


def _is_tcp_port_ready(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.2):
            return True
    except OSError:
        return False


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
