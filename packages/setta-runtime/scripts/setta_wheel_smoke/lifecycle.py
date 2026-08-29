from __future__ import annotations

import http.client
import time
import urllib.parse
from collections.abc import Callable, Mapping
from pathlib import Path
from types import TracebackType
from typing import Self

from setta_wheel_smoke.models import (
    APP_ID,
    APP_SESSION_VERIFY_TIMEOUT_SECONDS,
    COMMAND_TIMEOUT_SECONDS,
    HTTP_TIMEOUT_SECONDS,
    MAX_HTTP_BODY_BYTES,
    SmokeError,
    parse_json_document,
    read_bounded,
    require_object,
    validate_exact_loopback_origin,
)
from setta_wheel_smoke.process import ForegroundOpen, run_process


class FailureCapture:
    def __init__(self) -> None:
        self.error: BaseException | None = None

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        _exception_type: type[BaseException] | None,
        exception: BaseException | None,
        _traceback: TracebackType | None,
    ) -> bool:
        self.error = exception
        return exception is not None


def cleanup_live_server(
    live: ForegroundOpen,
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    readiness_url: str,
    *,
    failed: bool,
    close_foreground: Callable[[ForegroundOpen], None],
    session_cleanup: Callable[..., None],
    server_unavailable: Callable[..., None],
) -> SmokeError | None:

    failures: list[BaseException] = []
    _attempt(
        failures,
        live.terminate if failed else lambda: close_foreground(live),
    )
    _attempt(failures, live.cleanup_retained_session)
    _attempt(
        failures,
        lambda: session_cleanup(
            setta,
            environment,
            cwd,
            project,
            timeout=APP_SESSION_VERIFY_TIMEOUT_SECONDS,
        ),
    )
    if readiness_url:
        _attempt(
            failures,
            lambda: server_unavailable(
                readiness_url, timeout=APP_SESSION_VERIFY_TIMEOUT_SECONDS
            ),
        )
    if not failures:
        return None
    return SmokeError("; ".join(str(error) for error in failures))


def _attempt(failures: list[BaseException], action: Callable[[], None]) -> None:
    capture = FailureCapture()
    with capture:
        action()
    if capture.error is not None:
        failures.append(capture.error)


def assert_session_cleanup(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    *,
    timeout: float = COMMAND_TIMEOUT_SECONDS,
) -> None:
    code = _session_cleanup_code(setta, environment, cwd, project, timeout)
    if code == "session_not_found":
        return
    if code == "session_stale":
        final_code = _session_cleanup_code(setta, environment, cwd, project, timeout)
        if final_code != "session_not_found":
            raise SmokeError("foreground open left a live-session locator behind")
        raise SmokeError("foreground cleanup left a stale live-session locator")
    raise SmokeError("foreground open left a live-session locator behind")


def _session_cleanup_code(
    setta: Path,
    environment: Mapping[str, str],
    cwd: Path,
    project: Path,
    timeout: float,
) -> object:
    result = run_process(
        (str(setta), APP_ID, "session", "inspect", "--project", str(project)),
        cwd=cwd,
        env=environment,
        timeout=timeout,
        label="session cleanup inspection",
        allowed_returncodes=frozenset({2}),
    )
    error = parse_json_document(result.stderr, "session cleanup error")
    document = require_object(error, "session cleanup error")
    detail = require_object(document.get("error"), "session cleanup error detail")
    return detail.get("code")


def assert_server_unavailable(
    origin_url: str, *, timeout: float = HTTP_TIMEOUT_SECONDS
) -> None:
    validate_exact_loopback_origin(origin_url)
    if timeout <= 0:
        raise SmokeError("native-server cleanup verification has an invalid timeout")
    parsed = urllib.parse.urlsplit(origin_url)
    deadline = time.monotonic() + timeout
    while True:
        connection = http.client.HTTPConnection(
            "127.0.0.1", parsed.port, timeout=min(2.0, timeout)
        )
        try:
            connection.request(
                "GET", "/api/v2/runtime/session", headers={"Accept": "*/*"}
            )
            response = connection.getresponse()
        except (
            BrokenPipeError,
            ConnectionAbortedError,
            ConnectionRefusedError,
            ConnectionResetError,
            http.client.RemoteDisconnected,
        ):
            return
        except OSError as error:
            if getattr(error, "winerror", None) in {10053, 10054, 10061}:
                return
            raise SmokeError("unable to verify native-server cleanup") from error
        else:
            try:
                read_bounded(
                    response, MAX_HTTP_BODY_BYTES, "post-cleanup HTTP response"
                )
            finally:
                response.close()
        finally:
            connection.close()
        if time.monotonic() >= deadline:
            raise SmokeError(
                "foreground open left its native server reachable after cleanup"
            )
        time.sleep(0.05)
