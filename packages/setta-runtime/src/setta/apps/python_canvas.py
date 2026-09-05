from __future__ import annotations

import json
import secrets
import subprocess
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path

from ..errors import (
    InvalidInputError,
    RuntimeAssetError,
    RuntimeExecutionError,
    UnknownCommandError,
)
from ..jsonio import write_json
from ..network import validate_loopback_http_url
from ..registry import AppDescriptor, CommandContext
from ..runtime import PackagedRuntime, resolve_basedpyright_entrypoint
from ..sessions import LiveSession, LiveSessionStore
from ..supervisor import ExpectedReadiness, NativeServerSupervisor

APP_ID = "python-canvas"
_SESSION_SCHEMA_VERSION = "python-canvas-session/v1"
_IDENTITY_PATH = "/api/v2/runtime/session"


class PythonCanvasAdapter:
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
        checks: list[dict[str, object]] = []
        try:
            runtime = self._runtime(context).app(APP_ID)
            checks.append(
                {
                    "name": "packaged-runtime",
                    "status": "ok",
                    "nativeServer": str(runtime.native_server),
                    "webRoot": str(runtime.web_root),
                }
            )
        except RuntimeAssetError as error:
            checks.append(
                {"name": "packaged-runtime", "status": "error", "code": error.code}
            )
        try:
            entrypoint = self._basedpyright(context)
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
            arguments, value_flags=frozenset(), boolean_flags={"--pretty"}
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
            arguments,
            value_flags={"--project"},
            boolean_flags={"--create", "--no-open"},
        )
        project = _required_value(parsed, "--project", "open requires --project PATH.")
        canonical = self._sessions(context).canonical_project_path(project)
        runtime = self._runtime(context).app(APP_ID)
        basedpyright = self._basedpyright(context)
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
        runtime = self._runtime(context).app(APP_ID)
        try:
            completed = subprocess.run(
                [str(runtime.native_server), *arguments],
                check=False,
                stdin=context.stdin,
                stdout=context.stdout,
                stderr=context.stderr,
            )
        except OSError as error:
            raise RuntimeExecutionError(
                "Unable to execute the packaged Python Canvas command."
            ) from error
        return completed.returncode

    @staticmethod
    def _runtime(context: CommandContext) -> PackagedRuntime:
        return context.runtime

    @staticmethod
    def _sessions(context: CommandContext) -> LiveSessionStore:
        return context.sessions

    @staticmethod
    def _supervisor(context: CommandContext) -> NativeServerSupervisor:
        return context.supervisor

    @staticmethod
    def _basedpyright(context: CommandContext) -> Path:
        resolver = getattr(context, "basedpyright_resolver", None)
        if resolver is not None:
            return resolver()
        return resolve_basedpyright_entrypoint()

    @staticmethod
    def _validate_live_session(session: LiveSession) -> bool:
        request = urllib.request.Request(
            session.url + _IDENTITY_PATH,
            headers={"Accept": "application/json"},
            method="GET",
        )
        opener = urllib.request.build_opener(_NoRedirect())
        try:
            with opener.open(request, timeout=2) as response:
                if (
                    response.status != 200
                    or response.headers.get_content_type() != "application/json"
                ):
                    return False
                payload = response.read(16 * 1024 + 1)
        except (OSError, urllib.error.HTTPError, urllib.error.URLError):
            return False
        if len(payload) > 16 * 1024:
            return False
        try:
            document = json.loads(payload)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False
        return document == {
            "schemaVersion": _SESSION_SCHEMA_VERSION,
            "appId": APP_ID,
            "projectPath": session.project_path,
            "instanceNonce": session.instance_nonce,
        }

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


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


class _ParsedOptions:
    def __init__(
        self,
        values: Mapping[str, str],
        flags: frozenset[str],
        forwarded: tuple[str, ...],
    ):
        self.values = dict(values)
        self.flags = flags
        self.forwarded = forwarded

    def present(self, flag: str) -> bool:
        return flag in self.flags

    def forwarded_without(self, excluded: set[str]) -> tuple[str, ...]:
        result: list[str] = []
        index = 0
        while index < len(self.forwarded):
            token = self.forwarded[index]
            if token in excluded:
                index += 2
                continue
            result.append(token)
            index += 1
        return tuple(result)


def _parse_options(
    arguments: Sequence[str],
    *,
    value_flags: set[str] | frozenset[str],
    boolean_flags: set[str],
) -> _ParsedOptions:
    values: dict[str, str] = {}
    flags: set[str] = set()
    forwarded: list[str] = []
    index = 0
    while index < len(arguments):
        token = arguments[index]
        if token in boolean_flags:
            if token in flags:
                raise InvalidInputError(f"{token} may be supplied only once.")
            flags.add(token)
            forwarded.append(token)
            index += 1
            continue
        key, separator, inline_value = token.partition("=")
        if key in value_flags:
            if key in values:
                raise InvalidInputError(f"{key} may be supplied only once.")
            if separator:
                value = inline_value
            else:
                if index + 1 >= len(arguments):
                    raise InvalidInputError(f"{key} requires a value.")
                value = arguments[index + 1]
                index += 1
            if not value:
                raise InvalidInputError(f"{key} requires a value.")
            values[key] = value
            forwarded.extend((key, value))
            index += 1
            continue
        raise InvalidInputError(f"Unexpected Python Canvas argument {token!r}.")
    return _ParsedOptions(values, frozenset(flags), tuple(forwarded))


def _required_value(parsed: _ParsedOptions, flag: str, message: str) -> str:
    value = parsed.values.get(flag)
    if value is None:
        raise InvalidInputError(message)
    return value


def _is_help(arguments: Sequence[str]) -> bool:
    return len(arguments) == 1 and arguments[0] in {"--help", "-h", "help"}


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
        arguments, value_flags=value_flags, boolean_flags=boolean_flags
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
