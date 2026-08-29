from __future__ import annotations

import html.parser
import json
import os
import stat
import threading
import urllib.parse
import urllib.request
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import IO, Any, Protocol, TypeGuard

MAX_WHEEL_ENTRIES = 20_000
MAX_WHEEL_UNCOMPRESSED_BYTES = 768 * 1024 * 1024
MAX_WHEEL_TEXT_BYTES = 256 * 1024
MAX_PROCESS_OUTPUT_BYTES = 4 * 1024 * 1024
MAX_READINESS_BYTES = 16 * 1024
MAX_HTTP_BODY_BYTES = 4 * 1024 * 1024
MAX_HTTP_REQUEST_BYTES = 32 * 1024
MAX_RUN_STREAM_BYTES = 3 * 1024 * 1024
INSTALL_TIMEOUT_SECONDS = 300.0
COMMAND_TIMEOUT_SECONDS = 45.0
OPEN_READY_TIMEOUT_SECONDS = 45.0
OPEN_CLOSE_TIMEOUT_SECONDS = 20.0
APP_SESSION_GRACE_SECONDS = 6.0
APP_SESSION_FORCE_SETTLE_SECONDS = 2.0
APP_SESSION_VERIFY_TIMEOUT_SECONDS = 10.0
HTTP_TIMEOUT_SECONDS = 10.0
RUN_TIMEOUT_SECONDS = 5
RUN_ALLOWANCE_MILLISECONDS = 15_000
RUNTIME_MANIFEST_PATH = "setta/_runtime/manifest.json"
RUNTIME_PREFIX = "setta/_runtime/"
PUBLIC_OPEN_SCHEMA = "setta-open/v1"
SESSION_SCHEMA = "setta-live-session/v1"
RUNTIME_SESSION_SCHEMA = "python-canvas-session/v1"
APP_ID = "python-canvas"
APPLIED_PROJECT_NAME = "Setta Wheel Acceptance"
REQUIRED_OFFLINE_SCHEMA_COMMANDS = frozenset(
    {"schema", "open", "session.inspect", "snapshot", "apply", "run"}
)
PLATFORM_TAG_TARGETS = {
    "macosx_13_0_arm64": ("darwin", "arm64"),
    "macosx_13_0_x86_64": ("darwin", "amd64"),
    "manylinux_2_28_aarch64": ("linux", "arm64"),
    "manylinux_2_28_x86_64": ("linux", "amd64"),
    "win_amd64": ("windows", "amd64"),
}
SELECTOR_ENVIRONMENT_KEYS = frozenset(
    {
        "CONDA_DEFAULT_ENV",
        "CONDA_PREFIX",
        "PYENV_VERSION",
        "PYTHONEXECUTABLE",
        "PYTHONHOME",
        "PYTHONPATH",
        "VIRTUAL_ENV",
        "__PYVENV_LAUNCHER__",
    }
)
AMBIENT_RUNTIME_TOOL_KEYS = frozenset(
    {
        "DYLD_FALLBACK_LIBRARY_PATH",
        "DYLD_INSERT_LIBRARIES",
        "DYLD_LIBRARY_PATH",
        "LD_LIBRARY_PATH",
        "NODE_OPTIONS",
        "NODE_PATH",
        "PYTHONUSERBASE",
    }
)
FORBIDDEN_ARCHIVE_ROOTS = frozenset(
    {"apps", "build", "dist", "fixtures", "packages", "scripts"}
)
FORBIDDEN_ARCHIVE_SEGMENTS = frozenset({".git", ".pnpm", "__pycache__", "node_modules"})
WINDOWS = os.name == "nt"


class SmokeError(RuntimeError):
    pass


@dataclass(frozen=True)
class WheelInspection:
    path: Path
    version: str
    platform_tag: str
    target: tuple[str, str]
    native_member: str
    web_members: tuple[str, ...]


@dataclass(frozen=True)
class ProcessResult:
    command: tuple[str, ...]
    returncode: int
    stdout: bytes
    stderr: bytes


@dataclass(frozen=True)
class LiveSessionIdentity:
    project_path: str
    url: str
    owner_pid: int
    instance_nonce: str


@dataclass(frozen=True)
class HTTPResult:
    url: str
    status: int
    content_type: str
    body: bytes


class ReadableBytes(Protocol):
    def read(self, size: int = -1, /) -> bytes: ...


@dataclass(frozen=True)
class ProjectIdentity:
    project_id: str
    name: str
    revision: int


class BoundedBytes:
    def __init__(self, limit: int):
        self._limit = limit
        self._content = bytearray()
        self._exceeded = threading.Event()
        self._lock = threading.Lock()

    def append(self, value: bytes) -> None:
        with self._lock:
            remaining = self._limit - len(self._content)
            if remaining > 0:
                self._content.extend(value[:remaining])
            if len(value) > max(remaining, 0):
                self._exceeded.set()

    def bytes(self) -> bytes:
        with self._lock:
            return bytes(self._content)

    @property
    def exceeded(self) -> bool:
        return self._exceeded.is_set()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *arguments: object, **keywords: object) -> None:
        del arguments, keywords


class AssetReferences(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in {"link", "script"}:
            return
        for name, value in attrs:
            if value is None:
                continue
            if (tag == "link" and name.lower() == "href") or (
                tag == "script" and name.lower() == "src"
            ):
                self.references.append(value)


def parse_json_document(value: bytes, label: str) -> object:
    text = strict_utf8(value, label)
    try:
        return json.loads(text, object_pairs_hook=reject_duplicate_json_keys)
    except (json.JSONDecodeError, ValueError) as error:
        raise SmokeError(f"{label} is not one strict JSON document") from error


def reject_duplicate_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    document: dict[str, object] = {}
    for key, value in pairs:
        if key in document:
            raise ValueError(f"duplicate JSON key {key!r}")
        document[key] = value
    return document


def strict_utf8(value: bytes, label: str) -> str:
    try:
        return value.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SmokeError(f"{label} is not valid UTF-8") from error


def read_bounded(source: ReadableBytes, limit: int, label: str) -> bytes:
    content = bytearray()
    while True:
        remaining = limit - len(content)
        chunk = source.read(min(64 * 1024, remaining + 1))
        if not chunk:
            return bytes(content)
        content.extend(chunk)
        if len(content) > limit:
            raise SmokeError(f"{label} exceeded its bounded byte limit")


def safe_archive_path(value: str) -> None:
    path = PurePosixPath(value)
    if (
        not value
        or "\\" in value
        or path.is_absolute()
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise SmokeError(f"wheel has an unsafe archive path: {value!r}")


def safe_runtime_relative_path(value: str) -> None:
    safe_archive_path(value)
    if value.startswith(("setta/", "_runtime/")):
        raise SmokeError("runtime manifest path has an invalid prefix")


def target_for_platform_tag(platform_tag: str) -> tuple[str, str]:
    target = PLATFORM_TAG_TARGETS.get(platform_tag)
    if target is None:
        raise SmokeError(
            f"wheel uses an unsupported Setta release platform tag: {platform_tag!r}"
        )
    return target


def zip_info_is_executable(info: zipfile.ZipInfo) -> bool:
    mode = (info.external_attr >> 16) & 0xFFFF
    return info.create_system == 3 and stat.S_ISREG(mode) and bool(mode & stat.S_IXUSR)


def metadata_field(metadata: str, field: str) -> str:
    prefix = field + ": "
    values = [
        line.removeprefix(prefix)
        for line in metadata.splitlines()
        if line.startswith(prefix)
    ]
    if len(values) != 1 or not values[0]:
        raise SmokeError(f"wheel metadata has no unique {field} field")
    return values[0]


def require_object(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise SmokeError(f"{label} must be a JSON object")
    return value


def require_list(value: object, label: str) -> list[object]:
    if not isinstance(value, list):
        raise SmokeError(f"{label} must be a JSON array")
    return value


def is_positive_int(value: object) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def is_nonnegative_int(value: object) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def validate_exact_loopback_origin(value: str) -> None:
    try:
        parsed = urllib.parse.urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise SmokeError("public open readiness URL is invalid") from error
    if (
        parsed.scheme != "http"
        or parsed.hostname != "127.0.0.1"
        or port is None
        or port < 1
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path != ""
        or parsed.query
        or parsed.fragment
    ):
        raise SmokeError(
            "public open readiness URL is not an exact IPv4 loopback origin"
        )


def validate_http_url(value: str) -> None:
    try:
        parsed = urllib.parse.urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise SmokeError(f"HTTP request URL is invalid: {value}") from error
    if (
        parsed.scheme != "http"
        or parsed.hostname != "127.0.0.1"
        or port is None
        or port < 1
    ):
        raise SmokeError(f"HTTP request URL is outside the loopback boundary: {value}")
    if parsed.username is not None or parsed.password is not None or parsed.fragment:
        raise SmokeError(f"HTTP request URL is invalid: {value}")


def origin(parsed: urllib.parse.SplitResult) -> tuple[str, str, int | None]:
    try:
        return (parsed.scheme, parsed.hostname or "", parsed.port)
    except ValueError as error:
        raise SmokeError("HTML asset URL has an invalid origin") from error


def process_failure_message(
    command: Sequence[str], returncode: int, stdout: bytes, stderr: bytes
) -> str:
    rendered = " ".join(repr(part) for part in command)
    details = diagnostic_text(stderr) or diagnostic_text(stdout)
    suffix = f": {details}" if details else ""
    return f"command failed with exit {returncode}: {rendered}{suffix}"


def diagnostic_text(value: bytes) -> str:
    text = value.decode("utf-8", errors="replace").strip()
    if len(text) > 1000:
        return text[:1000] + "…"
    return text


def require_pipe(value: IO[Any] | None, label: str) -> ReadableBytes:
    if value is None:
        raise SmokeError(f"child process did not expose {label}")
    return value
