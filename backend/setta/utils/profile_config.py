import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, cast

from setta.utils.setta_home import resolve_setta_home

SettaFilesLocation = Literal["auto", "local", "global"]


class SettaProfileConfigError(ValueError):
    pass


class SettaProfileNotFoundError(SettaProfileConfigError):
    pass


@dataclass(frozen=True)
class SettaProfileConfig:
    name: str
    workspace_root: Path | None
    setta_home: Path | None
    setta_files_root: Path | None
    runtime_root: Path | None
    setta_files_location: SettaFilesLocation | None
    auth_cookie_name: str | None


def resolve_setta_profile_path(*, setta_home: Path, profile: str) -> Path:
    trimmed = profile.strip()
    if not trimmed:
        raise SettaProfileConfigError("Missing profile name.")
    if trimmed in {".", ".."}:
        raise SettaProfileConfigError(f"Invalid profile name: {profile!r}")
    if "/" in trimmed or "\\" in trimmed:
        raise SettaProfileConfigError(f"Invalid profile name: {profile!r}")
    return (setta_home / "profiles").resolve(strict=False) / f"{trimmed}.json"


def _coerce_optional_string(*, raw: object, label: str) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise SettaProfileConfigError(f"{label} must be a string.")
    trimmed = raw.strip()
    return trimmed or None


def _resolve_optional_path(
    *, raw_value: object, setta_home: Path, label: str
) -> Path | None:
    raw = _coerce_optional_string(raw=raw_value, label=label)
    if raw is None:
        return None
    expanded = os.path.expandvars(os.path.expanduser(raw))
    candidate = Path(expanded)
    if not candidate.is_absolute():
        candidate = setta_home / candidate
    return candidate.resolve(strict=False)


def _parse_setta_files_location(raw_value: object) -> SettaFilesLocation | None:
    raw = _coerce_optional_string(
        raw=raw_value, label="settaFilesLocation in profile config"
    )
    if raw is None:
        return None
    normalized = raw.lower()
    if normalized not in ("auto", "local", "global"):
        raise SettaProfileConfigError(
            "settaFilesLocation in profile config must be one of: auto, local, global."
        )
    return cast("SettaFilesLocation", normalized)


def _load_setta_profile_uncached(
    *, profile: str, setta_home: Path
) -> SettaProfileConfig:
    profile_path = resolve_setta_profile_path(setta_home=setta_home, profile=profile)
    if not profile_path.exists():
        raise SettaProfileNotFoundError(
            f"Unknown Setta profile: {profile.strip()!r}. Expected file: {profile_path}"
        )
    if not profile_path.is_file():
        raise SettaProfileConfigError(
            f"Profile path exists but is not a file: {profile_path}"
        )

    try:
        raw_text = profile_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SettaProfileConfigError(
            f"Failed to read Setta profile: {profile_path}"
        ) from exc

    try:
        raw = json.loads(raw_text) if raw_text.strip() else {}
    except json.JSONDecodeError as exc:
        raise SettaProfileConfigError(
            f"Invalid JSON in Setta profile: {profile_path}"
        ) from exc

    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise SettaProfileConfigError(
            f"Setta profile must be a JSON object: {profile_path}"
        )

    profile_name = _coerce_optional_string(raw=raw.get("name"), label="profile name")
    trimmed_selected_name = profile.strip()
    if profile_name is not None and profile_name != trimmed_selected_name:
        raise SettaProfileConfigError(
            f"Profile name mismatch in {profile_path}: expected {trimmed_selected_name!r}, got {profile_name!r}"
        )

    workspace_root = _resolve_optional_path(
        raw_value=raw.get("workspaceRoot"),
        setta_home=setta_home,
        label="workspaceRoot in profile config",
    )
    resolved_setta_home = _resolve_optional_path(
        raw_value=raw.get("settaHome"),
        setta_home=setta_home,
        label="settaHome in profile config",
    )
    setta_files_root = _resolve_optional_path(
        raw_value=raw.get("settaFilesRoot"),
        setta_home=setta_home,
        label="settaFilesRoot in profile config",
    )
    runtime_root = _resolve_optional_path(
        raw_value=raw.get("runtimeRoot"),
        setta_home=setta_home,
        label="runtimeRoot in profile config",
    )
    setta_files_location = _parse_setta_files_location(raw.get("settaFilesLocation"))
    auth_cookie_name = _coerce_optional_string(
        raw=raw.get("authCookieName"),
        label="authCookieName in profile config",
    )

    if setta_files_root is not None and setta_files_location is not None:
        raise SettaProfileConfigError(
            "Profile config cannot set both settaFilesRoot and settaFilesLocation."
        )

    return SettaProfileConfig(
        name=trimmed_selected_name,
        workspace_root=workspace_root,
        setta_home=resolved_setta_home,
        setta_files_root=setta_files_root,
        runtime_root=runtime_root,
        setta_files_location=setta_files_location,
        auth_cookie_name=auth_cookie_name,
    )


@lru_cache(maxsize=64)
def load_setta_profile(
    *, profile: str, setta_home: Path | None = None
) -> SettaProfileConfig:
    resolved_home = (setta_home or resolve_setta_home()).resolve(strict=False)
    return _load_setta_profile_uncached(profile=profile, setta_home=resolved_home)
