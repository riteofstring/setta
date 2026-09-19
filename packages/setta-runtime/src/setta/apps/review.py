from __future__ import annotations

import json
import os
import secrets
import stat
import subprocess
import urllib.error
import urllib.request
from collections.abc import Mapping, Sequence
from pathlib import Path

from ..errors import (
    InvalidInputError,
    RuntimeAssetError,
    RuntimeExecutionError,
    SessionNotFoundError,
    SessionStaleError,
    UnknownCommandError,
)
from ..jsonio import write_json
from ..registry import AppDescriptor, CommandContext
from ..sessions import LiveSession
from ..supervisor import ExpectedReadiness

APP_ID = "review"
_SESSION_SCHEMA_VERSION = "review-session/v1"
_IDENTITY_PATH = "/api/v2/runtime/session"
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
        try:
            runtime = context.runtime.app(APP_ID)
            return {
                "id": APP_ID,
                "status": "ok",
                "checks": [
                    {
                        "name": "packaged-runtime",
                        "status": "ok",
                        "nativeServer": str(runtime.native_server),
                        "webRoot": str(runtime.web_root),
                    }
                ],
            }
        except RuntimeAssetError as error:
            return {
                "id": APP_ID,
                "status": "error",
                "checks": [
                    {
                        "name": "packaged-runtime",
                        "status": "error",
                        "code": error.code,
                    }
                ],
            }

    def _open(self, arguments: Sequence[str], context: CommandContext) -> int:
        if _is_help(arguments):
            context.stdout.write(
                "Usage: setta review open --project-root PATH [--no-open]\n"
            )
            return 0
        parsed = _parse_options(
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
            arguments, value_flags=frozenset(), boolean_flags={"--pretty"}
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
        runtime = context.runtime.app(APP_ID)
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
                "Unable to execute the packaged Review command."
            ) from error
        return completed.returncode

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


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


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
        body = _read_live_file(source)
    if len(body) > _MAXIMUM_MUTATION_BYTES:
        raise InvalidInputError("Review input exceeds the byte limit.")
    return body


def _read_live_file(source: str) -> bytes:
    path = Path(source)
    descriptor = -1
    try:
        path_information = path.lstat()
        if stat.S_ISLNK(path_information.st_mode) or not stat.S_ISREG(
            path_information.st_mode
        ):
            raise InvalidInputError(
                f"Review input file {source!r} must be a regular non-symlink file."
            )
        flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        opened_information = os.fstat(descriptor)
        if not stat.S_ISREG(opened_information.st_mode) or not os.path.samestat(
            path_information, opened_information
        ):
            raise InvalidInputError(
                f"Review input file {source!r} must be a regular non-symlink file."
            )
        with os.fdopen(descriptor, "rb") as stream:
            descriptor = -1
            return stream.read(_MAXIMUM_MUTATION_BYTES + 1)
    except InvalidInputError:
        raise
    except OSError as error:
        raise InvalidInputError(
            f"Unable to read Review input file {source!r}."
        ) from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def _read_live_response(request: urllib.request.Request) -> object:
    try:
        with urllib.request.build_opener(_NoRedirect()).open(
            request, timeout=120
        ) as response:
            payload = response.read(_MAXIMUM_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        try:
            message = _live_http_error_message(error)
        finally:
            error.close()
        raise RuntimeExecutionError(message) from error
    except (OSError, urllib.error.URLError) as error:
        raise RuntimeExecutionError(
            "Unable to reach the live Review session."
        ) from error
    if len(payload) > _MAXIMUM_RESPONSE_BYTES:
        raise RuntimeExecutionError("The Review response exceeds the byte limit.")
    try:
        return json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeExecutionError("The Review response is not valid JSON.") from error


def _live_http_error_message(error: urllib.error.HTTPError) -> str:
    payload = error.read(64 * 1024 + 1)
    message = f"Review request failed with HTTP {error.code}."
    if len(payload) > 64 * 1024:
        return message
    try:
        document = json.loads(payload)
        candidate = document["message"]
    except (KeyError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
        return message
    return candidate if isinstance(candidate, str) else message


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

    def forwarded_with_value(self, flag: str, value: str) -> tuple[str, ...]:
        result: list[str] = []
        index = 0
        while index < len(self.forwarded):
            token = self.forwarded[index]
            result.append(token)
            if token == flag:
                result.append(value)
                index += 2
                continue
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
        if key not in value_flags:
            raise InvalidInputError(f"Unexpected Review argument {token!r}.")
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
    return _ParsedOptions(values, frozenset(flags), tuple(forwarded))


def _required_value(parsed: _ParsedOptions, flag: str, message: str) -> str:
    value = parsed.values.get(flag)
    if value is None:
        raise InvalidInputError(message)
    return value


def _is_help(arguments: Sequence[str]) -> bool:
    return len(arguments) == 1 and arguments[0] in {"--help", "-h", "help"}
