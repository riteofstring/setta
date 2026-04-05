import hashlib
import json
import os
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, cast

from setta.entrypoint import resolve_go_cli_command, resolve_go_cli_env
from setta.types.generated.go_shared_constants import (
    FILES_LOCATION_ENV,
    FILES_ROOT_ENV,
    PROFILE_ENV,
    PROFILE_LOOKUP_HOME_ENV,
    RUNTIME_ROOT_ENV,
    SETTA_HOME_ENV,
    WORKSPACE_ROOT_ENV,
)

SettaFilesLocation = Literal["auto", "local", "global"]
ResolvedSettaFilesLocation = Literal["local", "global"]


class SettaPathsError(ValueError):
    pass


class InvalidSettaFilesLocationError(SettaPathsError):
    pass


class ConflictingSettaFilesRootAndLocationError(SettaPathsError):
    pass


class UnknownSettaProfileError(SettaPathsError):
    pass


class InvalidSettaProfileError(SettaPathsError):
    pass


class InvalidSettaHomeError(SettaPathsError):
    pass


class InvalidSettaFilesRootError(SettaPathsError):
    pass


class InvalidLocalSettaFilesRootError(InvalidSettaFilesRootError):
    pass


class InvalidGlobalSettaFilesRootError(InvalidSettaFilesRootError):
    pass


class InvalidExplicitSettaFilesRootError(InvalidSettaFilesRootError):
    pass


class InvalidRuntimeRootError(SettaPathsError):
    pass


@dataclass(frozen=True)
class SettaPaths:
    workspace_root: Path
    setta_home: Path
    profile_lookup_home: Path
    profile_name: str | None
    setta_files_root: Path
    setta_files_location: ResolvedSettaFilesLocation | None
    runtime_root: Path
    auth_cookie_name: str | None

    @property
    def code_root(self) -> Path:
        return self.setta_files_root / "code"

    @property
    def artifacts_root(self) -> Path:
        return self.setta_files_root / "artifacts"

    @property
    def share_deployments_root(self) -> Path:
        return self.setta_files_root / "share_deployments"

    @property
    def runtime_sessions_root(self) -> Path:
        return self.runtime_root / "sessions"

    @property
    def runtime_logs_root(self) -> Path:
        return self.runtime_root / "logs"

    @property
    def runtime_mcp_root(self) -> Path:
        return self.runtime_root / "mcp"

    @property
    def runtime_secrets_root(self) -> Path:
        return self.runtime_root / "secrets"

    @property
    def runtime_detached_runs_root(self) -> Path:
        return self.runtime_root / "detached_runs"

    @property
    def default_runtime_root(self) -> Path:
        return (self.setta_files_root / "runtime").resolve(strict=False)

    @property
    def uses_explicit_runtime_root(self) -> bool:
        return self.runtime_root != self.default_runtime_root


def resolve_setta_paths(
    *,
    workspace_root: Path | str | None = None,
    setta_home: Path | str | None = None,
    profile_lookup_home: Path | str | None = None,
    setta_files_location: SettaFilesLocation | None = None,
    setta_files_root: Path | str | None = None,
    runtime_root: Path | str | None = None,
    profile: str | None = None,
    allow_env_files_overrides: bool = True,
    allow_env_non_files_overrides: bool = True,
    allow_profile_env_overrides: bool = True,
) -> SettaPaths:
    payload = _resolve_go_paths_payload(
        workspace_root=workspace_root,
        setta_home=setta_home,
        profile_lookup_home=profile_lookup_home,
        setta_files_location=setta_files_location,
        setta_files_root=setta_files_root,
        runtime_root=runtime_root,
        profile=profile,
        allow_env_files_overrides=allow_env_files_overrides,
        allow_env_non_files_overrides=allow_env_non_files_overrides,
        allow_profile_env_overrides=allow_profile_env_overrides,
    )
    uses_explicit_setta_files = _required_bool_field(payload, "usesExplicitSettaFiles")
    resolved_files_location = _required_string_field(payload, "resolvedFilesLocation")
    setta_files_location_result: ResolvedSettaFilesLocation | None = None
    if not uses_explicit_setta_files:
        normalized_location = resolved_files_location.strip().lower()
        if normalized_location not in ("local", "global"):
            raise SettaPathsError(
                "Setta paths payload returned an invalid resolvedFilesLocation: "
                f"{resolved_files_location!r}"
            )
        setta_files_location_result = cast(
            "ResolvedSettaFilesLocation", normalized_location
        )

    return SettaPaths(
        workspace_root=_required_path_field(payload, "workspaceRoot"),
        setta_home=_required_path_field(payload, "settaHome"),
        profile_lookup_home=_required_path_field(payload, "profileLookupHome"),
        profile_name=_optional_string_field(payload, "profile"),
        setta_files_root=_required_path_field(payload, "settaFilesRoot"),
        setta_files_location=setta_files_location_result,
        runtime_root=_required_path_field(payload, "runtimeRoot"),
        auth_cookie_name=_optional_string_field(payload, "authCookieName"),
    )


@lru_cache(maxsize=1)
def get_setta_paths() -> SettaPaths:
    return resolve_setta_paths()


# This helper remains available for tests and offline callers that need the
# deterministic global-root naming rule without running the Go CLI. The full
# path-selection authority now lives in Go via resolve_setta_paths().
def build_files_root_from_base(base_root: Path, workspace_root: Path) -> Path:
    sanitized_leaf = _sanitize_leaf(workspace_root.name)
    max_leaf_chars = 48
    if len(sanitized_leaf) > max_leaf_chars:
        sanitized_leaf = sanitized_leaf[:max_leaf_chars].rstrip("._-") or "workspace"
    canonical_workspace_root = workspace_root.resolve(strict=False)
    digest = hashlib.sha256(str(canonical_workspace_root).encode("utf-8")).hexdigest()[
        :8
    ]
    return base_root / f"{sanitized_leaf}-{digest}"


def _resolve_go_paths_payload(
    *,
    workspace_root: Path | str | None,
    setta_home: Path | str | None,
    profile_lookup_home: Path | str | None,
    setta_files_location: SettaFilesLocation | None,
    setta_files_root: Path | str | None,
    runtime_root: Path | str | None,
    profile: str | None,
    allow_env_files_overrides: bool,
    allow_env_non_files_overrides: bool,
    allow_profile_env_overrides: bool,
) -> dict[str, Any]:
    try:
        command, command_cwd = resolve_go_cli_command()
    except OSError as exc:
        raise SettaPathsError(str(exc)) from exc

    env = {
        **os.environ,
        **resolve_go_cli_env(command_cwd),
    }
    _apply_paths_env_override_policy(
        env,
        allow_env_files_overrides=allow_env_files_overrides,
        allow_env_non_files_overrides=allow_env_non_files_overrides,
        allow_profile_env_overrides=allow_profile_env_overrides,
    )
    args = _build_go_paths_command(
        command=command,
        cwd=Path.cwd().resolve(strict=False),
        workspace_root=workspace_root,
        setta_home=setta_home,
        profile_lookup_home=profile_lookup_home,
        setta_files_location=setta_files_location,
        setta_files_root=setta_files_root,
        runtime_root=runtime_root,
        profile=profile,
    )
    try:
        completed = subprocess.run(
            args,
            check=False,
            cwd=command_cwd,
            env=env,
            capture_output=True,
            text=True,
        )
    except OSError as exc:
        raise SettaPathsError(
            f"Failed to execute Go Setta paths command: {exc}"
        ) from exc

    if completed.returncode != 0:
        message = _normalize_go_command_error_output(
            completed.stderr.strip() or completed.stdout.strip()
        )
        raise SettaPathsError(message or "Go Setta paths command failed.")
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise SettaPathsError("Go Setta paths command returned invalid JSON.") from exc
    if not isinstance(payload, dict):
        raise SettaPathsError(
            "Go Setta paths command returned an invalid payload shape."
        )
    return payload


def _build_go_paths_command(
    *,
    command: list[str],
    cwd: Path,
    workspace_root: Path | str | None,
    setta_home: Path | str | None,
    profile_lookup_home: Path | str | None,
    setta_files_location: SettaFilesLocation | None,
    setta_files_root: Path | str | None,
    runtime_root: Path | str | None,
    profile: str | None,
) -> list[str]:
    args = [*command]
    _append_cli_string_flag(args, "--workspace", workspace_root)
    _append_cli_string_flag(args, "--setta-home", setta_home)
    _append_cli_string_flag(args, "--profile-lookup-home", profile_lookup_home)
    _append_cli_string_flag(args, "--setta-files-location", setta_files_location)
    _append_cli_string_flag(args, "--setta-files-root", setta_files_root)
    _append_cli_string_flag(args, "--runtime-root", runtime_root)
    _append_cli_string_flag(args, "--profile", profile)
    args.extend(["paths", "--json", "--cwd", str(cwd)])
    return args


def _append_cli_string_flag(
    args: list[str], flag_name: str, raw_value: Path | str | None
) -> None:
    value = _normalize_cli_string(raw_value)
    if value is None:
        return
    args.extend([flag_name, value])


def _normalize_cli_string(raw_value: Path | str | None) -> str | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, Path):
        return str(raw_value)
    trimmed = raw_value.strip()
    if not trimmed:
        return None
    return trimmed


def _apply_paths_env_override_policy(
    env: dict[str, str],
    *,
    allow_env_files_overrides: bool,
    allow_env_non_files_overrides: bool,
    allow_profile_env_overrides: bool,
) -> None:
    if not allow_env_files_overrides:
        env.pop(FILES_ROOT_ENV, None)
        env.pop(FILES_LOCATION_ENV, None)
    if not allow_env_non_files_overrides:
        env.pop(WORKSPACE_ROOT_ENV, None)
        env.pop(PROFILE_LOOKUP_HOME_ENV, None)
        env.pop(PROFILE_ENV, None)
        env.pop(SETTA_HOME_ENV, None)
        env.pop(RUNTIME_ROOT_ENV, None)
        return
    if not allow_profile_env_overrides:
        env.pop(PROFILE_ENV, None)


def _required_string_field(payload: dict[str, Any], field_name: str) -> str:
    value = payload.get(field_name)
    if not isinstance(value, str):
        raise SettaPathsError(
            f"Go Setta paths payload is missing required string field {field_name!r}."
        )
    trimmed = value.strip()
    if not trimmed:
        raise SettaPathsError(
            f"Go Setta paths payload returned a blank {field_name!r} field."
        )
    return trimmed


def _required_bool_field(payload: dict[str, Any], field_name: str) -> bool:
    value = payload.get(field_name)
    if not isinstance(value, bool):
        raise SettaPathsError(
            f"Go Setta paths payload is missing required bool field {field_name!r}."
        )
    return value


def _optional_string_field(payload: dict[str, Any], field_name: str) -> str | None:
    value = payload.get(field_name)
    if value is None:
        return None
    if not isinstance(value, str):
        raise SettaPathsError(
            f"Go Setta paths payload returned a non-string {field_name!r} field."
        )
    trimmed = value.strip()
    return trimmed or None


def _required_path_field(payload: dict[str, Any], field_name: str) -> Path:
    return Path(_required_string_field(payload, field_name)).resolve(strict=False)


def _normalize_go_command_error_output(raw_message: str) -> str:
    lines = [line.strip() for line in raw_message.splitlines() if line.strip()]
    if lines and lines[-1].startswith("exit status "):
        lines = lines[:-1]
    return "\n".join(lines)


def _sanitize_leaf(value: str) -> str:
    if not value:
        return "workspace"
    allowed_symbols = "._-"
    cleaned_chars: list[str] = []
    for ch in value:
        codepoint = ord(ch)
        is_ascii_alnum = (
            (48 <= codepoint <= 57)
            or (65 <= codepoint <= 90)
            or (97 <= codepoint <= 122)
        )
        if is_ascii_alnum or ch in allowed_symbols:
            cleaned_chars.append(ch)
        else:
            cleaned_chars.append("_")
    cleaned = "".join(cleaned_chars)
    cleaned = cleaned.strip("._-")
    return cleaned or "workspace"
