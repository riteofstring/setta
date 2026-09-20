from __future__ import annotations

import secrets
import subprocess
import urllib.request
from collections.abc import Callable, Sequence
from pathlib import Path

from ..errors import (
    InvalidInputError,
    RuntimeAssetError,
    UnknownCommandError,
)
from ..jsonio import write_json
from ..network import validate_loopback_http_url
from ..registry import AppDescriptor, CommandContext
from ..runtime import PackagedRuntime, resolve_basedpyright_entrypoint
from ..sessions import LiveSession, LiveSessionStore
from ..supervisor import ExpectedReadiness, NativeServerSupervisor
from ._support import (
    ParsedOptions as _ParsedOptions,
)
from ._support import (
    invoke_native,
    packaged_runtime_check,
    validate_live_session,
)
from ._support import (
    is_help as _is_help,
)
from ._support import (
    parse_options as _parse_options,
)
from ._support import (
    required_value as _required_value,
)

APP_ID = "python-canvas"
_SESSION_SCHEMA_VERSION = "python-canvas-session/v1"


class PythonCanvasAdapter:
    def __init__(
        self,
        basedpyright_resolver: Callable[[], Path] = resolve_basedpyright_entrypoint,
    ):
        self._basedpyright_resolver = basedpyright_resolver

    @property
    def descriptor(self) -> AppDescriptor:
        return AppDescriptor(
            app_id=APP_ID,
            name="Python Canvas",
            summary="Author and run one local Python project.",
        )

    def dispatch(self, arguments: Sequence[str], context: CommandContext) -> int:
        if not arguments or arguments[0] in {"--help", "-h", "help"}:
            self._write_help(context)
            return 0
        command, *remaining = arguments
        if command == "schema":
            return self._schema(remaining, context)
        if command == "open":
            return self._open(remaining, context)
        if command == "session":
            return self._session(remaining, context)
        if command in {"snapshot", "apply", "run"}:
            return self._live_command(command, remaining, context)
        raise UnknownCommandError(
            f"Unknown Python Canvas command {command!r}.", {"appId": APP_ID}
        )

    def doctor(self, context: CommandContext) -> dict[str, object]:
        checks = [packaged_runtime_check(APP_ID, context)]
        try:
            entrypoint = self._basedpyright()
            checks.append(
                {
                    "name": "basedpyright",
                    "status": "ok",
                    "entrypoint": str(entrypoint),
                }
            )
        except RuntimeAssetError as error:
            checks.append(
                {"name": "basedpyright", "status": "error", "code": error.code}
            )
        status = "ok" if all(check["status"] == "ok" for check in checks) else "error"
        return {"id": APP_ID, "status": status, "checks": checks}

    def _schema(self, arguments: Sequence[str], context: CommandContext) -> int:
        if _is_help(arguments):
            context.stdout.write("Usage: setta python-canvas schema [--pretty]\n")
            return 0
        parsed = _parse_options(
            "Python Canvas",
            arguments,
            value_flags=frozenset(),
            boolean_flags={"--pretty"},
        )
        return self._invoke_native(["schema", *parsed.forwarded], context)

    def _open(self, arguments: Sequence[str], context: CommandContext) -> int:
        if _is_help(arguments):
            context.stdout.write(
                "Usage: setta python-canvas open --project PATH "
                "[--create] [--no-open]\n"
            )
            return 0
        parsed = _parse_options(
            "Python Canvas",
            arguments,
            value_flags={"--project"},
            boolean_flags={"--create", "--no-open"},
        )
        project = _required_value(parsed, "--project", "open requires --project PATH.")
        canonical = self._sessions(context).canonical_project_path(project)
        runtime = self._runtime(context).app(APP_ID)
        basedpyright = self._basedpyright()
        nonce = secrets.token_urlsafe(32)
        supervisor = self._supervisor(context)
        sessions = self._sessions(context)
        with sessions.claim(APP_ID, canonical, self._validate_live_session) as lease:
            command: list[str | Path] = [
                runtime.native_server,
                "serve",
                "--project",
                canonical,
                "--launcher-python",
                context.launcher_python,
                "--basedpyright",
                basedpyright,
                "--web-root",
                runtime.web_root,
                "--port",
                "0",
                "--session-nonce",
                nonce,
                "--supervised-stdin",
            ]
            if parsed.present("--create"):
                command.append("--create")
            managed = supervisor.start(
                command,
                ExpectedReadiness(
                    app_id=APP_ID,
                    project_path=canonical,
                    instance_nonce=nonce,
                ),
            )
            session = LiveSession(
                app_id=APP_ID,
                project_path=canonical,
                url=managed.readiness.url,
                owner_pid=managed.process.pid,
                instance_nonce=nonce,
            )
            published = False
            try:
                lease.publish(session)
                published = True
            finally:
                if not published:
                    supervisor.stop(managed)
        write_json(
            context.stdout,
            {
                "appId": APP_ID,
                "projectPath": canonical,
                "schemaVersion": "setta-open/v1",
                "url": session.url,
            },
        )
        if not parsed.present("--no-open"):
            try:
                context.browser_open(session.url)
            except OSError:
                context.stderr.write(
                    "Setta could not open a browser automatically; use the printed "
                    "URL.\n"
                )
        try:
            return supervisor.wait_foreground(managed)
        finally:
            sessions.remove_if_owned(session)

    def _session(self, arguments: Sequence[str], context: CommandContext) -> int:
        if not arguments or arguments[0] in {"--help", "-h", "help"}:
            self._write_session_help(context)
            return 0
        command, *remaining = arguments
        if command != "inspect":
            raise UnknownCommandError(
                f"Unknown Python Canvas session command {command!r}.",
                {"appId": APP_ID},
            )
        if _is_help(remaining):
            self._write_session_help(context)
            return 0
        parsed = _parse_options(
            "Python Canvas",
            remaining,
            value_flags={"--project"},
            boolean_flags={"--pretty"},
        )
        project = _required_value(
            parsed, "--project", "session inspect requires --project PATH."
        )
        session = self._sessions(context).resolve(
            APP_ID, project, self._validate_live_session
        )
        write_json(
            context.stdout, session.document(), pretty=parsed.present("--pretty")
        )
        return 0

    def _live_command(
        self, command: str, arguments: Sequence[str], context: CommandContext
    ) -> int:
        if _is_help(arguments):
            self._write_live_command_help(command, context)
            return 0
        parsed = _parse_live_command(command, arguments)
        selector = _select_live_target(
            parsed, self._sessions(context), self._validate_live_session
        )
        forwarded = [
            command,
            "--url",
            selector,
            *parsed.forwarded_without({"--project", "--url"}),
        ]
        return self._invoke_native(forwarded, context)

    def _invoke_native(self, arguments: Sequence[str], context: CommandContext) -> int:
        return invoke_native(
            APP_ID, "Python Canvas", arguments, context, runner=subprocess.run
        )

    @staticmethod
    def _runtime(context: CommandContext) -> PackagedRuntime:
        return context.runtime

    @staticmethod
    def _sessions(context: CommandContext) -> LiveSessionStore:
        return context.sessions

    @staticmethod
    def _supervisor(context: CommandContext) -> NativeServerSupervisor:
        return context.supervisor

    def _basedpyright(self) -> Path:
        return self._basedpyright_resolver()

    @staticmethod
    def _validate_live_session(session: LiveSession) -> bool:
        return validate_live_session(
            session,
            app_id=APP_ID,
            schema_version=_SESSION_SCHEMA_VERSION,
            opener_factory=urllib.request.build_opener,
        )

    @staticmethod
    def _write_help(context: CommandContext) -> None:
        context.stdout.write(
            "Usage: setta python-canvas {schema|open|session|snapshot|apply|run} ...\n"
        )

    @staticmethod
    def _write_session_help(context: CommandContext) -> None:
        context.stdout.write(
            "Usage: setta python-canvas session inspect --project PATH [--pretty]\n"
        )

    @staticmethod
    def _write_live_command_help(command: str, context: CommandContext) -> None:
        usage = {
            "snapshot": (
                "Usage: setta python-canvas snapshot (--project PATH | --url URL) "
                "[--wait-diagnostics] [--timeout DURATION] [--pretty]\n"
            ),
            "apply": (
                "Usage: setta python-canvas apply (--project PATH | --url URL) "
                "--file PATH|- [--wait-diagnostics] [--timeout DURATION] [--pretty]\n"
            ),
            "run": (
                "Usage: setta python-canvas run (--project PATH | --url URL) "
                "[--wait-diagnostics] [--diagnostics-timeout DURATION] "
                "[--run-timeout DURATION] [--pretty]\n"
            ),
        }
        context.stdout.write(usage[command])


def _parse_live_command(command: str, arguments: Sequence[str]) -> _ParsedOptions:
    value_flags: set[str] = {"--project", "--url"}
    boolean_flags = {"--pretty", "--wait-diagnostics"}
    if command == "apply":
        value_flags.add("--file")
    if command == "run":
        value_flags.update({"--diagnostics-timeout", "--run-timeout"})
    else:
        value_flags.add("--timeout")
    parsed = _parse_options(
        "Python Canvas",
        arguments,
        value_flags=value_flags,
        boolean_flags=boolean_flags,
    )
    if command == "apply":
        _required_value(parsed, "--file", "apply requires --file PATH|-.")
    return parsed


def _select_live_target(
    parsed: _ParsedOptions,
    sessions: LiveSessionStore,
    verify: Callable[[LiveSession], bool],
) -> str:
    project = parsed.values.get("--project")
    url = parsed.values.get("--url")
    if (project is None) == (url is None):
        raise InvalidInputError("Specify exactly one of --project PATH or --url URL.")
    if url is not None:
        return validate_loopback_http_url(url)
    session = sessions.resolve(APP_ID, project or "", verify)
    return session.url
