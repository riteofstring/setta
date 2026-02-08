import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, cast

from setta.utils.setta_home import resolve_setta_home, resolve_setta_user_config_path

OpenWorkspaceFallback = Literal["create_local", "use_global_if_present"]
DefaultCreateLocation = Literal["local", "global"]


@dataclass(frozen=True)
class SettaUserConfig:
    global_setta_files_base: Path
    open_workspace_fallback: OpenWorkspaceFallback
    default_create_location: DefaultCreateLocation

    @staticmethod
    def defaults(*, setta_home: Path) -> "SettaUserConfig":
        return SettaUserConfig(
            global_setta_files_base=(setta_home / "setta_files").resolve(strict=False),
            open_workspace_fallback="create_local",
            default_create_location="local",
        )


def _resolve_path(value: str, *, setta_home: Path) -> Path:
    expanded = os.path.expandvars(os.path.expanduser(value))
    candidate = Path(expanded)
    if not candidate.is_absolute():
        candidate = setta_home / candidate
    return candidate.resolve(strict=False)


def _build_default_config_payload(*, setta_home: Path) -> dict[str, object]:
    defaults = SettaUserConfig.defaults(setta_home=setta_home)
    return {
        "globalSettaFilesBase": str(defaults.global_setta_files_base),
        "openWorkspaceFallback": defaults.open_workspace_fallback,
        "defaultCreateLocation": defaults.default_create_location,
    }


def _coerce_str(raw: object, *, label: str) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError(f"{label} must be a string.")
    trimmed = raw.strip()
    return trimmed or None


def _parse_open_workspace_fallback(value: str) -> OpenWorkspaceFallback:
    if value in ("create_local", "use_global_if_present"):
        return cast("OpenWorkspaceFallback", value)
    raise ValueError(
        "openWorkspaceFallback must be one of: create_local, use_global_if_present."
    )


def _parse_default_create_location(value: str) -> DefaultCreateLocation:
    if value in ("local", "global"):
        return cast("DefaultCreateLocation", value)
    raise ValueError("defaultCreateLocation must be one of: local, global.")


def _load_setta_user_config_uncached(*, setta_home: Path) -> SettaUserConfig:
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    defaults = SettaUserConfig.defaults(setta_home=setta_home)

    if not config_path.exists():
        # Missing config is valid; treat it as defaults. Avoid side effects (like
        # creating ~/.setta/config.json) during import-time path resolution.
        return defaults

    try:
        raw_text = config_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"Failed to read Setta config: {config_path}") from exc

    try:
        raw = json.loads(raw_text) if raw_text.strip() else {}
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in Setta config: {config_path}") from exc

    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise ValueError(f"Setta config must be a JSON object: {config_path}")

    raw_base = _coerce_str(
        raw.get("globalSettaFilesBase"), label="globalSettaFilesBase"
    )
    raw_fallback = _coerce_str(
        raw.get("openWorkspaceFallback"), label="openWorkspaceFallback"
    )
    raw_default_location = _coerce_str(
        raw.get("defaultCreateLocation"), label="defaultCreateLocation"
    )

    base_path = (
        _resolve_path(raw_base, setta_home=setta_home)
        if raw_base is not None
        else defaults.global_setta_files_base
    )

    fallback = (
        _parse_open_workspace_fallback(raw_fallback)
        if raw_fallback is not None
        else defaults.open_workspace_fallback
    )

    default_location = (
        _parse_default_create_location(raw_default_location)
        if raw_default_location is not None
        else defaults.default_create_location
    )

    if base_path.exists() and not base_path.is_dir():
        raise ValueError(f"globalSettaFilesBase is not a directory: {base_path}")

    return SettaUserConfig(
        global_setta_files_base=base_path,
        open_workspace_fallback=fallback,
        default_create_location=default_location,
    )


@lru_cache(maxsize=1)
def load_setta_user_config(*, setta_home: Path | None = None) -> SettaUserConfig:
    resolved_home = (setta_home or resolve_setta_home()).resolve(strict=False)
    return _load_setta_user_config_uncached(setta_home=resolved_home)


def clear_setta_user_config_cache() -> None:
    load_setta_user_config.cache_clear()
