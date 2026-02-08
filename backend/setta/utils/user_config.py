import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, cast

from setta.utils.setta_home import resolve_setta_home, resolve_setta_user_config_path

AutoMode = Literal["create_local", "use_global_if_present", "create_global"]


@dataclass(frozen=True)
class SettaUserConfig:
    global_setta_files_base: Path
    auto_mode: AutoMode

    @staticmethod
    def defaults(*, setta_home: Path) -> "SettaUserConfig":
        return SettaUserConfig(
            global_setta_files_base=(setta_home / "setta_files").resolve(strict=False),
            auto_mode="create_local",
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
        "autoMode": defaults.auto_mode,
    }


def _coerce_str(raw: object, *, label: str) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError(f"{label} must be a string.")
    trimmed = raw.strip()
    return trimmed or None


def _parse_auto_mode(value: str) -> AutoMode:
    if value in ("create_local", "use_global_if_present", "create_global"):
        return cast("AutoMode", value)
    raise ValueError(
        "autoMode must be one of: create_local, use_global_if_present, create_global."
    )


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
    raw_auto_mode = _coerce_str(raw.get("autoMode"), label="autoMode")
    if "openWorkspaceFallback" in raw or "defaultCreateLocation" in raw:
        raise ValueError(
            f"Setta config uses removed keys openWorkspaceFallback/defaultCreateLocation: {config_path}. "
            "Use autoMode instead."
        )

    base_path = (
        _resolve_path(raw_base, setta_home=setta_home)
        if raw_base is not None
        else defaults.global_setta_files_base
    )

    auto_mode: AutoMode
    if raw_auto_mode is not None:
        auto_mode = _parse_auto_mode(raw_auto_mode)
    else:
        auto_mode = defaults.auto_mode

    if base_path.exists() and not base_path.is_dir():
        raise ValueError(f"globalSettaFilesBase is not a directory: {base_path}")

    return SettaUserConfig(
        global_setta_files_base=base_path,
        auto_mode=auto_mode,
    )


@lru_cache(maxsize=1)
def load_setta_user_config(*, setta_home: Path | None = None) -> SettaUserConfig:
    resolved_home = (setta_home or resolve_setta_home()).resolve(strict=False)
    return _load_setta_user_config_uncached(setta_home=resolved_home)


def clear_setta_user_config_cache() -> None:
    load_setta_user_config.cache_clear()


def ensure_setta_user_config_exists(*, setta_home: Path | None = None) -> str | None:
    """Create a default <setta_home>/config.json if it does not exist.

    This is intended to be called from the CLI/server entrypoint, not during
    import-time path resolution.

    Returns an error message string if creation fails; otherwise returns None.
    """

    resolved_home = (setta_home or resolve_setta_home()).resolve(strict=False)
    config_path = resolve_setta_user_config_path(setta_home=resolved_home)

    if config_path.exists():
        if config_path.is_file():
            return None
        return f"Setta config path exists but is not a file: {config_path}"

    try:
        resolved_home.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        return f"Failed to create Setta home directory: {resolved_home} ({exc})"

    payload = _build_default_config_payload(setta_home=resolved_home)
    try:
        with config_path.open("x", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
    except FileExistsError:
        # Another process won the race; treat as success.
        return None
    except OSError as exc:
        return f"Failed to write Setta config: {config_path} ({exc})"

    clear_setta_user_config_cache()
    return None
