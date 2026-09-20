from __future__ import annotations

import json
import os
import secrets
import subprocess
import urllib.parse
import urllib.request
from collections.abc import Sequence

from ..errors import (
    InvalidInputError,
    SessionNotFoundError,
    SessionStaleError,
    UnknownCommandError,
)
from ..jsonio import write_json
from ..registry import AppDescriptor, CommandContext
from ..sessions import LiveSession
from ..supervisor import ExpectedReadiness
from ._support import (
    ParsedOptions as _ParsedOptions,
)
from ._support import (
    invoke_native,
    packaged_runtime_check,
    read_json_response,
    read_regular_file,
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

APP_ID = "realtime"
_SESSION_SCHEMA_VERSION = "realtime-session/v1"
_MAXIMUM_COMMAND_BYTES = 4 * 1024 * 1024


class RealtimeAdapter:
    @property
    def descriptor(self) -> AppDescriptor:
        return AppDescriptor(
            app_id=APP_ID,
            name="Realtime",
            summary="Build and run one local interactive application.",
        )

    def dispatch(self, arguments: Sequence[str], context: CommandContext) -> int:
        if not arguments or arguments[0] in {"--help", "-h", "help"}:
            self._write_help(context)
            return 0
        command, *remaining = arguments
        if command == "open":
            return self._open(remaining, context)
        if command == "schema":
            return self._schema(remaining, context)
        if command in {"snapshot", "apply", "reload", "invoke"}:
            return self._project_command(command, remaining, context)
        raise UnknownCommandError(
            f"Unknown Realtime command {command!r}.", {"appId": APP_ID}
        )

    def doctor(self, context: CommandContext) -> dict[str, object]:
        check = packaged_runtime_check(APP_ID, context)
        return {"id": APP_ID, "status": check["status"], "checks": [check]}

    def _open(self, arguments: Sequence[str], context: CommandContext) -> int:
        if _is_help(arguments):
            context.stdout.write(
                "Usage: setta realtime open --project-root PATH "
                "[--create] [--no-open]\n"
            )
            return 0
        parsed = _parse_options(
            "Realtime",
            arguments,
            value_flags={"--project-root"},
            boolean_flags={"--create", "--no-open"},
        )
        project = _required_value(
            parsed, "--project-root", "open requires --project-root PATH."
        )
        canonical = context.sessions.canonical_project_path(project)
        runtime = context.runtime.app(APP_ID)
        nonce = secrets.token_urlsafe(32)
        with context.sessions.claim(
            APP_ID, canonical, self._validate_live_session
        ) as lease:
            managed = context.supervisor.start(
                [
                    runtime.native_server,
                    "serve",
                    "--project-root",
                    canonical,
                    f"--create={str(parsed.present('--create')).lower()}",
                    "--launcher-python",
                    context.launcher_python,
                    "--web-root",
                    runtime.web_root,
                    "--session-nonce",
                    nonce,
                    "--supervised-stdin=true",
                    "--port",
                    "0",
                ],
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
                    context.supervisor.stop(managed)
        try:
            _read_live_response(_runtime_reload_request(session))
        except BaseException:
            context.sessions.remove_if_owned(session)
            context.supervisor.stop(managed)
            raise
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
                    "Setta could not open a browser automatically; "
                    "use the printed URL.\n"
                )
        try:
            return context.supervisor.wait_foreground(managed)
        finally:
            context.sessions.remove_if_owned(session)

    def _schema(self, arguments: Sequence[str], context: CommandContext) -> int:
        if _is_help(arguments):
            context.stdout.write("Usage: setta realtime schema [--pretty]\n")
            return 0
        parsed = _parse_options(
            "Realtime", arguments, value_flags=frozenset(), boolean_flags={"--pretty"}
        )
        return self._invoke_native(["schema", *parsed.forwarded], context)

    def _project_command(
        self, command: str, arguments: Sequence[str], context: CommandContext
    ) -> int:
        if _is_help(arguments):
            self._write_project_help(command, context)
            return 0
        value_flags = {"--project-root"}
        if command == "apply":
            value_flags.add("--file")
        if command == "invoke":
            value_flags.update({"--file", "--handler"})
        parsed = _parse_options(
            "Realtime", arguments, value_flags=value_flags, boolean_flags={"--pretty"}
        )
        project = _required_value(
            parsed,
            "--project-root",
            f"{command} requires --project-root PATH.",
        )
        if command == "apply":
            _required_value(parsed, "--file", "apply requires --file PATH|-.")
        if command == "invoke":
            _required_value(parsed, "--handler", "invoke requires --handler NAME.")
        canonical = context.sessions.canonical_project_path(project)
        try:
            session = context.sessions.resolve(
                APP_ID, canonical, self._validate_live_session
            )
        except (SessionNotFoundError, SessionStaleError):
            session = None
        if session is not None:
            return self._invoke_live(command, parsed, session, context)
        forwarded = parsed.forwarded_with_value("--project-root", canonical)
        return self._invoke_native([command, *forwarded], context)

    @staticmethod
    def _invoke_live(
        command: str,
        parsed: _ParsedOptions,
        session: LiveSession,
        context: CommandContext,
    ) -> int:
        request = _live_request(command, parsed, session, context)
        document = _read_live_response(request)
        if parsed.present("--pretty"):
            json.dump(document, context.stdout, indent=2, sort_keys=True)
            context.stdout.write("\n")
        else:
            write_json(context.stdout, document)
        return 0

    @staticmethod
    def _write_help(context: CommandContext) -> None:
        context.stdout.write(
            "Usage: setta realtime {open|schema|snapshot|apply|reload|invoke} ...\n"
        )

    @staticmethod
    def _write_project_help(command: str, context: CommandContext) -> None:
        usage = {
            "snapshot": (
                "Usage: setta realtime snapshot --project-root PATH [--pretty]\n"
            ),
            "apply": (
                "Usage: setta realtime apply --project-root PATH --file PATH|- "
                "[--pretty]\n"
            ),
            "reload": "Usage: setta realtime reload --project-root PATH [--pretty]\n",
            "invoke": (
                "Usage: setta realtime invoke --project-root PATH --handler NAME "
                "[--file PATH|-] [--pretty]\n"
            ),
        }
        context.stdout.write(usage[command])

    @staticmethod
    def _invoke_native(arguments: Sequence[str], context: CommandContext) -> int:
        environment = os.environ.copy()
        environment["SETTA_LAUNCHER_PYTHON"] = str(context.launcher_python)
        return invoke_native(
            APP_ID,
            "Realtime",
            arguments,
            context,
            environment=environment,
            runner=subprocess.run,
        )

    @staticmethod
    def _validate_live_session(session: LiveSession) -> bool:
        return validate_live_session(
            session,
            app_id=APP_ID,
            schema_version=_SESSION_SCHEMA_VERSION,
            opener_factory=urllib.request.build_opener,
        )


def _live_request(
    command: str,
    parsed: _ParsedOptions,
    session: LiveSession,
    context: CommandContext,
) -> urllib.request.Request:
    path = _live_path(command, parsed)
    body = _live_input(command, parsed, context)
    method = "POST" if command in {"apply", "reload", "invoke"} else "GET"
    headers = {"Accept": "application/json"}
    if command in {"apply", "invoke"}:
        headers["Content-Type"] = "application/json"
    if method == "POST":
        headers["Origin"] = session.url
        body = body if body is not None else b""
    return urllib.request.Request(
        session.url + path, data=body, headers=headers, method=method
    )


def _runtime_reload_request(session: LiveSession) -> urllib.request.Request:
    return urllib.request.Request(
        session.url + "/api/v1/runtime/reload",
        data=b"",
        headers={"Accept": "application/json", "Origin": session.url},
        method="POST",
    )


def _live_path(command: str, parsed: _ParsedOptions) -> str:
    if command == "invoke":
        return "/api/v1/runtime/invoke/" + urllib.parse.quote(
            parsed.values["--handler"], safe=""
        )
    return {
        "snapshot": "/api/v1/runtime/snapshot",
        "apply": "/api/v1/project/apply",
        "reload": "/api/v1/runtime/reload",
    }[command]


def _live_input(
    command: str, parsed: _ParsedOptions, context: CommandContext
) -> bytes | None:
    if command not in {"apply", "invoke"}:
        return None
    source = parsed.values.get("--file")
    if source is None:
        return b'{"arguments":{},"content":[]}'
    if source == "-":
        body = context.stdin.read(_MAXIMUM_COMMAND_BYTES + 1).encode("utf-8")
    else:
        body = read_regular_file(source, _MAXIMUM_COMMAND_BYTES, "Realtime")
    if len(body) > _MAXIMUM_COMMAND_BYTES:
        raise InvalidInputError("Realtime input exceeds the byte limit.")
    return body


def _read_live_response(request: urllib.request.Request) -> object:
    return read_json_response(
        request,
        application_name="Realtime",
        maximum_bytes=_MAXIMUM_COMMAND_BYTES,
        error_path=("error", "message"),
        opener_factory=urllib.request.build_opener,
    )
