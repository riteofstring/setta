import os
import shlex
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

LauncherPlatform = Literal["macos", "linux", "windows"]

_TRUTHY_VALUES = {"1", "true", "yes", "on"}
_FALSY_VALUES = {"0", "false", "no", "off"}


class LauncherArtifactError(ValueError):
    pass


@dataclass(frozen=True)
class LauncherArtifactContext:
    target_command: list[str]
    channel: str
    existing_managed_artifacts: dict[str, str]
    options: dict[str, str]


def normalize_artifact_options(raw_options: dict[str, str]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for raw_key, raw_value in raw_options.items():
        key = raw_key.strip()
        if not key:
            raise LauncherArtifactError("Artifact option names must be non-empty.")
        value = raw_value.strip()
        if not value:
            raise LauncherArtifactError(
                f"Artifact option `{key}` must have a non-empty value."
            )
        normalized[key] = value
    return normalized


def current_platform() -> LauncherPlatform:
    if sys.platform == "darwin":
        return "macos"
    if os.name == "nt" or sys.platform.startswith("win"):
        return "windows"
    return "linux"


def install_current_platform_artifacts(
    *,
    context: LauncherArtifactContext,
) -> dict[str, str]:
    platform = current_platform()
    if platform == "macos":
        from setta.launcher_artifacts.macos import install_macos_artifacts

        return install_macos_artifacts(context=context)
    if platform == "windows":
        from setta.launcher_artifacts.windows import install_windows_artifacts

        return install_windows_artifacts(context=context)
    from setta.launcher_artifacts.linux import install_linux_artifacts

    return install_linux_artifacts(context=context)


def plan_current_platform_artifact_paths(
    *,
    context: LauncherArtifactContext,
) -> dict[str, Path]:
    platform = current_platform()
    if platform == "macos":
        from setta.launcher_artifacts.macos import plan_macos_artifact_paths

        return plan_macos_artifact_paths(context=context)
    if platform == "windows":
        from setta.launcher_artifacts.windows import plan_windows_artifact_paths

        return plan_windows_artifact_paths(context=context)
    from setta.launcher_artifacts.linux import plan_linux_artifact_paths

    return plan_linux_artifact_paths(context=context)


def current_platform_artifact_keys() -> set[str]:
    platform = current_platform()
    if platform == "macos":
        from setta.launcher_artifacts.macos import MANAGED_ARTIFACT_KEYS

        return set(MANAGED_ARTIFACT_KEYS)
    if platform == "windows":
        from setta.launcher_artifacts.windows import MANAGED_ARTIFACT_KEYS

        return set(MANAGED_ARTIFACT_KEYS)
    from setta.launcher_artifacts.linux import MANAGED_ARTIFACT_KEYS

    return set(MANAGED_ARTIFACT_KEYS)


def parse_bool_option(
    *,
    options: dict[str, str],
    key: str,
    default: bool,
) -> bool:
    raw_value = options.get(key)
    if raw_value is None:
        return default
    normalized = raw_value.strip().lower()
    if normalized in _TRUTHY_VALUES:
        return True
    if normalized in _FALSY_VALUES:
        return False
    raise LauncherArtifactError(
        f"Artifact option `{key}` must be one of: true/false, 1/0, yes/no, on/off."
    )


def option_path(*, options: dict[str, str], key: str) -> Path | None:
    raw_value = options.get(key)
    if raw_value is None:
        return None
    return Path(raw_value).expanduser().resolve(strict=False)


def existing_artifact_path(
    *,
    existing_managed_artifacts: dict[str, str],
    key: str,
) -> Path | None:
    raw_value = existing_managed_artifacts.get(key)
    if raw_value is None:
        return None
    return Path(raw_value).expanduser().resolve(strict=False)


def resolve_path_option_with_existing(
    *,
    options: dict[str, str],
    option_key: str,
    existing_managed_artifacts: dict[str, str],
    existing_key: str,
    default_path: Path,
) -> Path:
    configured = option_path(options=options, key=option_key)
    if configured is not None:
        return configured
    existing = existing_artifact_path(
        existing_managed_artifacts=existing_managed_artifacts,
        key=existing_key,
    )
    if existing is not None:
        return existing
    return default_path.expanduser().resolve(strict=False)


def shell_command(parts: list[str]) -> str:
    return shlex.join(parts)


def shell_array_literal(parts: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in parts)


def validate_file_name_component(*, option_key: str, raw_value: str) -> str:
    normalized_value = raw_value.strip()
    if not normalized_value:
        raise LauncherArtifactError(
            f"Artifact option `{option_key}` must be non-empty."
        )
    if normalized_value in {".", ".."}:
        raise LauncherArtifactError(
            f"Artifact option `{option_key}` must not contain parent/self references."
        )
    if "/" in normalized_value or "\\" in normalized_value:
        raise LauncherArtifactError(
            f"Artifact option `{option_key}` must be a file name, not a path."
        )
    path_candidate = Path(normalized_value)
    if path_candidate.name != normalized_value:
        raise LauncherArtifactError(
            f"Artifact option `{option_key}` must be a file name, not a path."
        )
    return normalized_value


def write_text_file(*, path: Path, content: str, executable: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    if executable:
        current_mode = stat.S_IMODE(path.stat().st_mode)
        path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def remove_path_if_exists(path: Path) -> bool:
    if not path.exists():
        return False
    if path.is_dir() and not path.is_symlink():
        for child in path.iterdir():
            if child.is_dir() and not child.is_symlink():
                remove_path_if_exists(child)
            else:
                child.unlink()
        path.rmdir()
        return True
    path.unlink()
    return True
