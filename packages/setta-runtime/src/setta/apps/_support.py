from __future__ import annotations

import json
import os
import stat
import subprocess
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any, cast

from ..errors import InvalidInputError, RuntimeAssetError, RuntimeExecutionError
from ..registry import CommandContext
from ..sessions import LiveSession

_IDENTITY_PATH = "/api/v2/runtime/session"
_MAXIMUM_IDENTITY_BYTES = 16 * 1024
_MAXIMUM_ERROR_BYTES = 64 * 1024


class ParsedOptions:
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

    def forwarded_without(self, excluded: set[str]) -> tuple[str, ...]:
        result: list[str] = []
        index = 0
        while index < len(self.forwarded):
            token = self.forwarded[index]
            if token in excluded:
                index += 2 if token in self.values else 1
                continue
            result.append(token)
            index += 1
        return tuple(result)


def parse_options(
    application_name: str,
    arguments: Sequence[str],
    *,
    value_flags: set[str] | frozenset[str],
    boolean_flags: set[str],
) -> ParsedOptions:
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
            raise InvalidInputError(
                f"Unexpected {application_name} argument {token!r}."
            )
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
    return ParsedOptions(values, frozenset(flags), tuple(forwarded))


def required_value(parsed: ParsedOptions, flag: str, message: str) -> str:
    value = parsed.values.get(flag)
    if value is None:
        raise InvalidInputError(message)
    return value


def is_help(arguments: Sequence[str]) -> bool:
    return len(arguments) == 1 and arguments[0] in {"--help", "-h", "help"}


def packaged_runtime_check(app_id: str, context: CommandContext) -> dict[str, object]:
    try:
        runtime = context.runtime.app(app_id)
        return {
            "name": "packaged-runtime",
            "status": "ok",
            "nativeServer": str(runtime.native_server),
            "webRoot": str(runtime.web_root),
        }
    except RuntimeAssetError as error:
        return {"name": "packaged-runtime", "status": "error", "code": error.code}


def invoke_native(
    app_id: str,
    application_name: str,
    arguments: Sequence[str],
    context: CommandContext,
    *,
    environment: Mapping[str, str] | None = None,
    runner: Callable[..., subprocess.CompletedProcess[Any]] = subprocess.run,
) -> int:
    runtime = context.runtime.app(app_id)
    options: dict[str, object] = {
        "check": False,
        "stdin": context.stdin,
        "stdout": context.stdout,
        "stderr": context.stderr,
    }
    if environment is not None:
        options["env"] = environment
    try:
        completed = runner([str(runtime.native_server), *arguments], **options)
    except OSError as error:
        raise RuntimeExecutionError(
            f"Unable to execute the packaged {application_name} command."
        ) from error
    return completed.returncode


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


def validate_live_session(
    session: LiveSession,
    *,
    app_id: str,
    schema_version: str,
    opener_factory: Callable[..., urllib.request.OpenerDirector] = (
        urllib.request.build_opener
    ),
) -> bool:
    request = urllib.request.Request(
        session.url + _IDENTITY_PATH,
        headers={"Accept": "application/json"},
        method="GET",
    )
    opener = opener_factory(_NoRedirect())
    try:
        with opener.open(request, timeout=2) as response:
            if (
                response.status != 200
                or response.headers.get_content_type() != "application/json"
            ):
                return False
            payload = response.read(_MAXIMUM_IDENTITY_BYTES + 1)
    except (OSError, urllib.error.HTTPError, urllib.error.URLError):
        return False
    if len(payload) > _MAXIMUM_IDENTITY_BYTES:
        return False
    try:
        document = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False
    return document == {
        "schemaVersion": schema_version,
        "appId": app_id,
        "projectPath": session.project_path,
        "instanceNonce": session.instance_nonce,
    }


def read_regular_file(source: str, maximum_bytes: int, application_name: str) -> bytes:
    path = Path(source)
    descriptor = -1
    message = (
        f"{application_name} input file {source!r} must be a regular non-symlink file."
    )
    try:
        path_information = path.lstat()
        if stat.S_ISLNK(path_information.st_mode) or not stat.S_ISREG(
            path_information.st_mode
        ):
            raise InvalidInputError(message)
        flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        opened_information = os.fstat(descriptor)
        if not stat.S_ISREG(opened_information.st_mode) or not os.path.samestat(
            path_information, opened_information
        ):
            raise InvalidInputError(message)
        with os.fdopen(descriptor, "rb") as stream:
            descriptor = -1
            return stream.read(maximum_bytes + 1)
    except InvalidInputError:
        raise
    except OSError as error:
        raise InvalidInputError(
            f"Unable to read {application_name} input file {source!r}."
        ) from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def read_json_response(
    request: urllib.request.Request,
    *,
    application_name: str,
    maximum_bytes: int,
    error_path: tuple[str, ...],
    opener_factory: Callable[..., urllib.request.OpenerDirector] = (
        urllib.request.build_opener
    ),
) -> object:
    try:
        with opener_factory(_NoRedirect()).open(request, timeout=120) as response:
            payload = response.read(maximum_bytes + 1)
    except urllib.error.HTTPError as error:
        try:
            message = _http_error_message(error, application_name, error_path)
        finally:
            error.close()
        raise RuntimeExecutionError(message) from error
    except (OSError, urllib.error.URLError) as error:
        raise RuntimeExecutionError(
            f"Unable to reach the live {application_name} session."
        ) from error
    if len(payload) > maximum_bytes:
        raise RuntimeExecutionError(
            f"The {application_name} response exceeds the byte limit."
        )
    try:
        return json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeExecutionError(
            f"The {application_name} response is not valid JSON."
        ) from error


def _http_error_message(
    error: urllib.error.HTTPError,
    application_name: str,
    error_path: tuple[str, ...],
) -> str:
    payload = error.read(_MAXIMUM_ERROR_BYTES + 1)
    fallback = f"{application_name} request failed with HTTP {error.code}."
    if len(payload) > _MAXIMUM_ERROR_BYTES:
        return fallback
    try:
        candidate: object = json.loads(payload)
        for key in error_path:
            if not isinstance(candidate, dict):
                return fallback
            candidate = cast(dict[str, object], candidate)[key]
    except (KeyError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
        return fallback
    return candidate if isinstance(candidate, str) else fallback
