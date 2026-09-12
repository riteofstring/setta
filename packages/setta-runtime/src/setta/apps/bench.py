from __future__ import annotations

import json
import secrets
import urllib.error
import urllib.request
from collections.abc import Mapping, Sequence

from ..errors import InvalidInputError, RuntimeAssetError, UnknownCommandError
from ..jsonio import write_json
from ..registry import AppDescriptor, CommandContext
from ..sessions import LiveSession
from ..supervisor import ExpectedReadiness

APP_ID = "bench"
_SESSION_SCHEMA_VERSION = "bench-session/v1"
_IDENTITY_PATH = "/api/v1/runtime/session"


class BenchAdapter:
    @property
    def descriptor(self) -> AppDescriptor:
        return AppDescriptor(
            app_id=APP_ID,
            name="Bench",
            summary="Compare code-based experiments against repeatable cases.",
        )

    def dispatch(self, arguments: Sequence[str], context: CommandContext) -> int:
        if not arguments or arguments[0] in {"--help", "-h", "help"}:
            self._write_help(context)
            return 0
        command, *remaining = arguments
        if command == "open":
            return self._open(remaining, context)
        raise UnknownCommandError(
            f"Unknown Bench command {command!r}.", {"appId": APP_ID}
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
                "Usage: setta bench open --project-root PATH [--create] [--no-open]\n"
            )
            return 0
        parsed = _parse_options(
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
                    "Setta could not open a browser automatically; "
                    "use the printed URL.\n"
                )
        try:
            return context.supervisor.wait_foreground(managed)
        finally:
            context.sessions.remove_if_owned(session)

    @staticmethod
    def _write_help(context: CommandContext) -> None:
        context.stdout.write("Usage: setta bench open ...\n")

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


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


class _ParsedOptions:
    def __init__(self, values: Mapping[str, str], flags: frozenset[str]):
        self.values = dict(values)
        self.flags = flags

    def present(self, flag: str) -> bool:
        return flag in self.flags


def _parse_options(
    arguments: Sequence[str],
    *,
    value_flags: set[str],
    boolean_flags: set[str],
) -> _ParsedOptions:
    values: dict[str, str] = {}
    flags: set[str] = set()
    index = 0
    while index < len(arguments):
        token = arguments[index]
        if token in boolean_flags:
            if token in flags:
                raise InvalidInputError(f"{token} may be supplied only once.")
            flags.add(token)
            index += 1
            continue
        key, separator, inline_value = token.partition("=")
        if key not in value_flags:
            raise InvalidInputError(f"Unexpected Bench argument {token!r}.")
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
        index += 1
    return _ParsedOptions(values, frozenset(flags))


def _required_value(parsed: _ParsedOptions, flag: str, message: str) -> str:
    value = parsed.values.get(flag)
    if value is None:
        raise InvalidInputError(message)
    return value


def _is_help(arguments: Sequence[str]) -> bool:
    return len(arguments) == 1 and arguments[0] in {"--help", "-h", "help"}
