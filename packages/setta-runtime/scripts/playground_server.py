from __future__ import annotations

import os
import signal
import subprocess
import sys
import tempfile
import time
import webbrowser
from collections.abc import Callable
from contextlib import suppress
from pathlib import Path
from typing import Any

from scripts import playground_options, run_local_setta
from setta.apps._support import validate_live_session
from setta.errors import SessionNotFoundError, SessionStaleError, SettaError
from setta.sessions import LiveSessionStore

STARTUP_TIMEOUT = 30.0
STOP_TIMEOUT = 10.0
LOG_ROOT = run_local_setta.ROOT / "tmp/playground-logs"


def run(
    app: str,
    options: playground_options.PlaygroundOptions,
    prepare_workspace: Callable[[Path], Path],
) -> int:
    try:
        session = inspect_session(app, options.workspace)
        if options.stop:
            stop(app, options.workspace, session)
            return 0
        if session is None:
            workspace = prepare_workspace(options.workspace)
            print(
                f"Starting {app} playground. "
                "The first launch may take a few minutes to build the apps.",
                flush=True,
            )
            executable = run_local_setta.prepare()
            session = start(executable, app, workspace)
        url = str(session["url"])
        playground_options.announce(app, options.workspace, url)
        if not options.no_open:
            open_browser(url)
        return 0
    except (OSError, RuntimeError, subprocess.SubprocessError, SettaError) as error:
        message = error.message if isinstance(error, SettaError) else str(error)
        sys.stderr.write(
            f"{app} playground: {message}\nYour saved work is preserved.\n"
        )
        return 1
    except KeyboardInterrupt:
        sys.stderr.write(
            "Playground startup cancelled. Your saved work is preserved.\n"
        )
        return 130


def project_arguments(app: str, workspace: Path) -> list[str]:
    if app == "python-canvas":
        return ["--project", str(workspace / "project.json")]
    return ["--project-root", str(workspace)]


def inspect_session(app: str, workspace: Path) -> dict[str, Any] | None:
    try:
        session = LiveSessionStore().resolve(
            app,
            project_arguments(app, workspace)[1],
            lambda candidate: validate_live_session(
                candidate, app_id=app, schema_version=f"{app}-session/v1"
            ),
        )
    except (SessionNotFoundError, SessionStaleError):
        return None
    return session.document()


def start(executable: Path, app: str, workspace: Path) -> dict[str, Any]:
    LOG_ROOT.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=f"{app}-", suffix=".log", dir=LOG_ROOT)
    log = Path(name)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        process = subprocess.Popen(
            [
                str(executable),
                app,
                "open",
                *project_arguments(app, workspace),
                "--no-open",
            ],
            stdin=subprocess.DEVNULL,
            stdout=stream,
            stderr=subprocess.STDOUT,
            start_new_session=os.name != "nt",
            creationflags=0x00000008 | 0x00000200 if os.name == "nt" else 0,
            cwd=run_local_setta.ROOT,
        )
    try:
        deadline = time.monotonic() + STARTUP_TIMEOUT
        while time.monotonic() < deadline:
            exited = process.poll() is not None
            output = log.read_text(encoding="utf-8", errors="replace")
            if exited or '"schemaVersion":"setta-open/v1"' in output.replace(" ", ""):
                session = inspect_session(app, workspace)
                if session is not None:
                    return session
                if exited:
                    raise RuntimeError(f"Startup failed.\n{output[-4000:]}\nLog: {log}")
            time.sleep(0.1)
        raise RuntimeError(f"The playground did not become ready. Log: {log}")
    except BaseException:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        raise


def stop(app: str, workspace: Path, session: dict[str, Any] | None) -> None:
    if session is None:
        print(f"{app} playground is already stopped. Your saved work is preserved.")
        return
    with suppress(ProcessLookupError):
        os.kill(int(session["ownerPid"]), signal.SIGTERM)
    deadline = time.monotonic() + STOP_TIMEOUT
    while time.monotonic() < deadline:
        current = inspect_session(app, workspace)
        if current is None or current["instanceNonce"] != session["instanceNonce"]:
            print(f"Stopped {app} playground. Your saved work is preserved.")
            return
        time.sleep(0.1)
    raise RuntimeError("The playground is still stopping; try --stop again shortly.")


def open_browser(url: str) -> None:
    try:
        if webbrowser.open(url):
            return
    except webbrowser.Error:
        pass
    except OSError:
        pass
    sys.stderr.write("Could not open a browser automatically. Open the URL above.\n")
