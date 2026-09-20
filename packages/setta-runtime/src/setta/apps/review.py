from __future__ import annotations

import secrets
import subprocess
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

APP_ID = "review"
_SESSION_SCHEMA_VERSION = "review-session/v1"
_MAXIMUM_MUTATION_BYTES = 4 * 1024 * 1024
_MAXIMUM_RESPONSE_BYTES = 64 * 1024 * 1024


class ReviewAdapter:
    @property
    def descriptor(self) -> AppDescriptor:
        return AppDescriptor(
            app_id=APP_ID,
            name="Review",
            summary="Inspect submitted work and return portable decisions.",
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
        if command in {"snapshot", "apply", "export"}:
            return self._project_command(command, remaining, context)
        raise UnknownCommandError(
            f"Unknown Review command {command!r}.", {"appId": APP_ID}
        )

    def doctor(self, context: CommandContext) -> dict[str, object]:
        check = packaged_runtime_check(APP_ID, context)
        return {"id": APP_ID, "status": check["status"], "checks": [check]}

    def _open(self, arguments: Sequence[str], context: CommandContext) -> int:
        if _is_help(arguments):
            context.stdout.write(
                "Usage: setta review open --project-root PATH [--no-open]\n"
            )
            return 0
        parsed = _parse_options(
            "Review",
            arguments,
            value_flags={"--project-root"},
            boolean_flags={"--no-open"},
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
            return context.supervisor.wait_foreground(managed)
        finally:
            context.sessions.remove_if_owned(session)

    def _schema(self, arguments: Sequence[str], context: CommandContext) -> int:
        if _is_help(arguments):
            context.stdout.write("Usage: setta review schema [--pretty]\n")
            return 0
        parsed = _parse_options(
            "Review", arguments, value_flags=frozenset(), boolean_flags={"--pretty"}
        )
        return self._invoke_native(["schema", *parsed.forwarded], context)

    def _project_command(
        self, command: str, arguments: Sequence[str], context: CommandContext
    ) -> int:
        if _is_help(arguments):
            self._write_project_help(command, context)
            return 0
        value_flags = {"--project-root"}
        boolean_flags = {"--pretty"}
        if command == "apply":
            value_flags.add("--file")
        if command == "export":
            value_flags.add("--output-dir")
            boolean_flags.add("--continuations")
        parsed = _parse_options(
            "Review",
            arguments,
            value_flags=value_flags,
            boolean_flags=boolean_flags,
        )
        project = _required_value(
            parsed,
            "--project-root",
            f"{command} requires --project-root PATH.",
        )
        if command == "apply":
            _required_value(parsed, "--file", "apply requires --file PATH|-.")
        canonical = context.sessions.canonical_project_path(project)
        if command in {"snapshot", "apply"}:
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
        write_json(context.stdout, document, pretty=parsed.present("--pretty"))
        return 0

    @staticmethod
    def _invoke_native(arguments: Sequence[str], context: CommandContext) -> int:
        return invoke_native(
            APP_ID, "Review", arguments, context, runner=subprocess.run
        )

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
            "Usage: setta review {open|schema|snapshot|apply|export} ...\n"
        )

    @staticmethod
    def _write_project_help(command: str, context: CommandContext) -> None:
        usage = {
            "snapshot": "Usage: setta review snapshot --project-root PATH [--pretty]\n",
            "apply": (
                "Usage: setta review apply --project-root PATH --file PATH|- "
                "[--pretty]\n"
            ),
            "export": (
                "Usage: setta review export --project-root PATH "
                "[--output-dir PATH] [--continuations] [--pretty]\n"
            ),
        }
        context.stdout.write(usage[command])


def _live_request(
    command: str,
    parsed: _ParsedOptions,
    session: LiveSession,
    context: CommandContext,
) -> urllib.request.Request:
    body = _live_input(parsed, context) if command == "apply" else None
    method = "POST" if command == "apply" else "GET"
    headers = {"Accept": "application/json"}
    if command == "apply":
        headers["Content-Type"] = "application/json"
        headers["Origin"] = session.url
    return urllib.request.Request(
        session.url
        + {"snapshot": "/api/v1/review", "apply": "/api/v1/review/apply"}[command],
        data=body,
        headers=headers,
        method=method,
    )


def _live_input(parsed: _ParsedOptions, context: CommandContext) -> bytes:
    source = parsed.values["--file"]
    if source == "-":
        body = context.stdin.read(_MAXIMUM_MUTATION_BYTES + 1).encode("utf-8")
    else:
        body = read_regular_file(source, _MAXIMUM_MUTATION_BYTES, "Review")
    if len(body) > _MAXIMUM_MUTATION_BYTES:
        raise InvalidInputError("Review input exceeds the byte limit.")
    return body


def _read_live_response(request: urllib.request.Request) -> object:
    return read_json_response(
        request,
        application_name="Review",
        maximum_bytes=_MAXIMUM_RESPONSE_BYTES,
        error_path=("message",),
        opener_factory=urllib.request.build_opener,
    )
