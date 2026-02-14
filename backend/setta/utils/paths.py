import hashlib
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, cast

from setta.utils.env_vars import (
    FILES_LOCATION_ENV,
    FILES_ROOT_ENV,
    PROFILE_ENV,
    PROFILE_LOOKUP_HOME_ENV,
    RUNTIME_ROOT_ENV,
    SETTA_HOME_ENV,
    WORKSPACE_ROOT_ENV,
)
from setta.utils.profile_config import (
    SettaProfileConfig,
    SettaProfileConfigError,
    SettaProfileNotFoundError,
    clear_setta_profile_config_cache,
    load_setta_profile,
)
from setta.utils.setta_home import resolve_setta_home
from setta.utils.user_config import load_setta_user_config

SettaFilesLocation = Literal["auto", "local", "global"]
ResolvedSettaFilesLocation = Literal["local", "global"]
_ALLOWED_SETTA_HOME_NAMES = frozenset({".setta", ".setta-development"})
_ALLOWED_SETTA_FILES_ROOT_SEGMENTS = frozenset({"setta_files", "setta_files_dev"})


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
) -> SettaPaths:
    profile_name = _resolve_profile_name(
        profile, allow_env_overrides=allow_env_non_files_overrides
    )
    profile_config: SettaProfileConfig | None = None
    if profile_name is None:
        resolved_setta_home = _resolve_setta_home(
            explicit_setta_home=setta_home,
            profile_setta_home=None,
            allow_env_overrides=allow_env_non_files_overrides,
        )
        resolved_profile_lookup_home = resolved_setta_home
    else:
        resolved_profile_lookup_home = _resolve_profile_lookup_home(
            explicit_profile_lookup_home=profile_lookup_home,
            explicit_setta_home=setta_home,
            allow_env_overrides=allow_env_non_files_overrides,
        )
        profile_config = _load_profile_config(
            profile_name=profile_name,
            setta_home=resolved_profile_lookup_home,
        )
        resolved_setta_home = _resolve_setta_home(
            explicit_setta_home=setta_home,
            profile_setta_home=profile_config.setta_home,
            allow_env_overrides=allow_env_non_files_overrides,
        )
    _validate_setta_home_name(
        resolved_profile_lookup_home,
        label="Setta profile lookup home",
    )
    _validate_setta_home_name(
        resolved_setta_home,
        label="Setta home",
    )
    resolved_workspace = _resolve_workspace_root(
        workspace_root=workspace_root,
        profile_workspace_root=profile_config.workspace_root
        if profile_config
        else None,
        allow_env_overrides=allow_env_non_files_overrides,
    )
    resolved_files_root, resolved_location = _resolve_files_root(
        workspace_root=resolved_workspace,
        setta_home=resolved_setta_home,
        setta_files_root=setta_files_root,
        profile_setta_files_root=profile_config.setta_files_root
        if profile_config
        else None,
        setta_files_location=setta_files_location,
        profile_setta_files_location=profile_config.setta_files_location
        if profile_config
        else None,
        allow_env_files_overrides=allow_env_files_overrides,
    )
    resolved_runtime_root = _resolve_runtime_root(
        setta_files_root=resolved_files_root,
        runtime_root=runtime_root,
        profile_runtime_root=profile_config.runtime_root if profile_config else None,
        allow_env_overrides=allow_env_non_files_overrides,
    )
    _validate_setta_files_root_path(resolved_files_root)
    _validate_runtime_root_path(
        runtime_root=resolved_runtime_root,
        workspace_root=resolved_workspace,
    )
    return SettaPaths(
        workspace_root=resolved_workspace,
        setta_home=resolved_setta_home,
        profile_lookup_home=resolved_profile_lookup_home,
        profile_name=profile_name,
        setta_files_root=resolved_files_root,
        setta_files_location=resolved_location,
        runtime_root=resolved_runtime_root,
        auth_cookie_name=profile_config.auth_cookie_name if profile_config else None,
    )


@lru_cache(maxsize=1)
def get_setta_paths() -> SettaPaths:
    return resolve_setta_paths()


def clear_setta_paths_cache() -> None:
    get_setta_paths.cache_clear()
    # clear_setta_paths_cache is the "big hammer" tests use when they change env vars.
    # Keep dependent caches in sync so overrides behave as expected.
    from setta.utils.user_config import clear_setta_user_config_cache

    clear_setta_user_config_cache()
    clear_setta_profile_config_cache()


def normalize_workspace_path(
    path: Path | str, workspace_root: Path | None = None
) -> Path:
    root = workspace_root or get_setta_paths().workspace_root
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate.expanduser().resolve(strict=False)
    return (root / candidate).resolve(strict=False)


def normalize_state_path(
    path: Path | str, setta_files_root: Path | None = None
) -> Path:
    root = setta_files_root or get_setta_paths().setta_files_root
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate.expanduser().resolve(strict=False)
    return (root / candidate).resolve(strict=False)


def workspace_relative_path(
    path: Path | str, workspace_root: Path | None = None
) -> Path:
    root = workspace_root or get_setta_paths().workspace_root
    resolved = normalize_workspace_path(path, workspace_root=root)
    try:
        return resolved.relative_to(root)
    except ValueError:
        return resolved


def ensure_within_workspace_root(
    path: Path, *, label: str, workspace_root: Path | None = None
) -> Path:
    root = workspace_root or get_setta_paths().workspace_root
    resolved = path.resolve(strict=False)
    if not resolved.is_relative_to(root):
        raise ValueError(f"{label} must be within the project root.")
    return resolved


def resolve_workspace_child_path(
    raw_path: str, *, label: str, workspace_root: Path | None = None
) -> Path:
    root = workspace_root or get_setta_paths().workspace_root
    trimmed = raw_path.strip()
    if not trimmed:
        raise ValueError(f"Missing {label}.")
    resolved = normalize_workspace_path(trimmed, workspace_root=root)
    if not resolved.is_relative_to(root):
        raise ValueError(f"{label} must be within the project root.")
    return resolved


def validate_workspace_root(path: Path) -> None:
    if not path.exists():
        raise ValueError(f"Workspace root does not exist: {path}")
    if not path.is_dir():
        raise ValueError(f"Workspace root is not a directory: {path}")


def validate_optional_dir(raw_path: Path | str | None, *, label: str) -> Path | None:
    if raw_path is None:
        return None
    path = resolve_path(raw_path)
    if path.exists() and not path.is_dir():
        raise ValueError(f"{label} is not a directory: {path}")
    return path


def get_optional_dir_validation_error(
    raw_path: Path | str | None, *, label: str
) -> str | None:
    try:
        validate_optional_dir(raw_path, label=label)
    except ValueError as exc:
        return str(exc)
    return None


def build_files_root_from_base(base_root: Path, workspace_root: Path) -> Path:
    sanitized_leaf = _sanitize_leaf(workspace_root.name)
    # Keep the computed directory name comfortably under common filesystem name
    # limits (often 255 bytes) even when workspace names are long.
    max_leaf_chars = 48
    if len(sanitized_leaf) > max_leaf_chars:
        sanitized_leaf = sanitized_leaf[:max_leaf_chars].rstrip("._-") or "workspace"
    digest = hashlib.sha256(str(workspace_root).encode("utf-8")).hexdigest()[:8]
    return base_root / f"{sanitized_leaf}-{digest}"


def _resolve_profile_name(
    profile: str | None, *, allow_env_overrides: bool
) -> str | None:
    raw = profile
    if raw is None and allow_env_overrides:
        raw = os.environ.get(PROFILE_ENV)
    if raw is None:
        return None
    trimmed = raw.strip()
    return trimmed or None


def _load_profile_config(
    *, profile_name: str | None, setta_home: Path
) -> SettaProfileConfig | None:
    if profile_name is None:
        return None
    try:
        return load_setta_profile(profile=profile_name, setta_home=setta_home)
    except SettaProfileNotFoundError as exc:
        raise UnknownSettaProfileError(str(exc)) from exc
    except SettaProfileConfigError as exc:
        raise InvalidSettaProfileError(str(exc)) from exc


def _resolve_setta_home_without_profile(
    setta_home: Path | str | None,
    *,
    allow_env_overrides: bool,
) -> Path:
    if setta_home is not None:
        return resolve_path(setta_home)
    if allow_env_overrides:
        profile_lookup_env = os.environ.get(PROFILE_LOOKUP_HOME_ENV)
        if profile_lookup_env is not None:
            trimmed_lookup = profile_lookup_env.strip()
            if trimmed_lookup:
                return resolve_path(trimmed_lookup)
        raw_env = os.environ.get(SETTA_HOME_ENV)
        if raw_env is not None:
            trimmed = raw_env.strip()
            if trimmed:
                return resolve_path(trimmed)
    return resolve_setta_home(allow_env_override=False).resolve(strict=False)


def _resolve_profile_lookup_home(
    *,
    explicit_profile_lookup_home: Path | str | None,
    explicit_setta_home: Path | str | None,
    allow_env_overrides: bool,
) -> Path:
    if explicit_profile_lookup_home is not None:
        return resolve_path(explicit_profile_lookup_home)
    return _resolve_setta_home_without_profile(
        explicit_setta_home,
        allow_env_overrides=allow_env_overrides,
    )


def _resolve_setta_home(
    *,
    explicit_setta_home: Path | str | None,
    profile_setta_home: Path | None,
    allow_env_overrides: bool,
) -> Path:
    if explicit_setta_home is not None:
        return resolve_path(explicit_setta_home)
    if profile_setta_home is not None:
        return profile_setta_home.resolve(strict=False)
    if allow_env_overrides:
        raw_env = os.environ.get(SETTA_HOME_ENV)
        if raw_env is not None:
            trimmed = raw_env.strip()
            if trimmed:
                return resolve_path(trimmed)
    return resolve_setta_home(allow_env_override=False).resolve(strict=False)


def _resolve_workspace_root(
    *,
    workspace_root: Path | str | None,
    profile_workspace_root: Path | None,
    allow_env_overrides: bool,
) -> Path:
    if workspace_root is not None:
        return resolve_path(workspace_root)
    if profile_workspace_root is not None:
        return profile_workspace_root.resolve(strict=False)
    if allow_env_overrides:
        raw_env = os.environ.get(WORKSPACE_ROOT_ENV)
        if raw_env is not None:
            trimmed = raw_env.strip()
            if trimmed:
                return resolve_path(trimmed)
    return Path.cwd().resolve(strict=False)


def _resolve_files_root(
    workspace_root: Path,
    *,
    setta_home: Path,
    setta_files_root: Path | str | None,
    profile_setta_files_root: Path | None,
    setta_files_location: SettaFilesLocation | None,
    profile_setta_files_location: SettaFilesLocation | None,
    allow_env_files_overrides: bool,
) -> tuple[Path, ResolvedSettaFilesLocation | None]:
    local_root = (workspace_root / "setta_files").resolve(strict=False)

    explicit_root = _resolve_optional_path_value(setta_files_root)
    explicit_location = _normalize_location_value(setta_files_location)

    profile_root = (
        profile_setta_files_root.resolve(strict=False)
        if profile_setta_files_root is not None
        else None
    )
    profile_location = _normalize_location_value(profile_setta_files_location)

    env_root = (
        _resolve_optional_path_value(os.environ.get(FILES_ROOT_ENV))
        if allow_env_files_overrides
        else None
    )
    env_location = (
        _normalize_location_value(os.environ.get(FILES_LOCATION_ENV))
        if allow_env_files_overrides
        else None
    )

    if explicit_root is not None and explicit_location is not None:
        raise ConflictingSettaFilesRootAndLocationError(
            "Cannot use --setta-files-root together with --setta-files-location."
        )
    if profile_root is not None and profile_location is not None:
        raise ConflictingSettaFilesRootAndLocationError(
            "Selected profile sets both settaFilesRoot and settaFilesLocation."
        )
    if env_root is not None and env_location is not None:
        raise ConflictingSettaFilesRootAndLocationError(
            f"Environment variables {FILES_ROOT_ENV} and {FILES_LOCATION_ENV} cannot both be set."
        )

    selected_root: Path | None = None
    selected_location: SettaFilesLocation | None = None

    if explicit_root is not None:
        selected_root = explicit_root
    elif explicit_location is not None:
        selected_location = explicit_location
    elif profile_root is not None:
        selected_root = profile_root
    elif profile_location is not None:
        selected_location = profile_location
    elif env_root is not None:
        selected_root = env_root
    elif env_location is not None:
        selected_location = env_location
    else:
        selected_location = "auto"

    if selected_root is not None:
        if selected_root.exists() and not selected_root.is_dir():
            raise InvalidExplicitSettaFilesRootError(
                f"setta files root is not a directory: {selected_root}"
            )
        return selected_root.resolve(strict=False), None

    if selected_location is None:
        selected_location = "auto"

    if selected_location in ("local", "auto"):
        if local_root.exists() and not local_root.is_dir():
            raise InvalidLocalSettaFilesRootError(
                f"Local setta_files path is not a directory: {local_root}"
            )

    if local_root.is_dir():
        return local_root, "local"

    if selected_location == "local":
        return local_root, "local"

    config = load_setta_user_config(setta_home=setta_home)
    global_root = build_files_root_from_base(
        config.global_setta_files_base, workspace_root
    ).resolve(strict=False)
    if global_root.exists() and not global_root.is_dir():
        raise InvalidGlobalSettaFilesRootError(
            f"Global setta_files path is not a directory: {global_root}"
        )

    if selected_location == "global":
        return global_root, "global"

    if config.auto_mode == "create_local":
        return local_root, "local"

    if global_root.is_dir():
        return global_root, "global"

    if config.auto_mode == "create_global":
        return global_root, "global"
    return local_root, "local"


def _resolve_runtime_root(
    setta_files_root: Path,
    *,
    runtime_root: Path | str | None,
    profile_runtime_root: Path | None,
    allow_env_overrides: bool,
) -> Path:
    explicit_runtime_root = _resolve_optional_path_value(runtime_root)
    if explicit_runtime_root is not None:
        return explicit_runtime_root
    if profile_runtime_root is not None:
        return profile_runtime_root.resolve(strict=False)
    if allow_env_overrides:
        env_runtime_root = _resolve_optional_path_value(
            os.environ.get(RUNTIME_ROOT_ENV)
        )
        if env_runtime_root is not None:
            return env_runtime_root
    return (setta_files_root / "runtime").resolve(strict=False)


def resolve_path(raw: Path | str) -> Path:
    if isinstance(raw, Path):
        raw_value = str(raw)
    else:
        raw_value = raw
    expanded = os.path.expandvars(os.path.expanduser(raw_value))
    return Path(expanded).resolve(strict=False)


def _resolve_optional_path_value(raw: Path | str | None) -> Path | None:
    if raw is None:
        return None
    if isinstance(raw, Path):
        return resolve_path(raw)
    trimmed = raw.strip()
    if not trimmed:
        return None
    return resolve_path(trimmed)


def _normalize_location_value(
    raw: SettaFilesLocation | str | None,
) -> SettaFilesLocation | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        trimmed = raw.strip().lower()
    else:
        trimmed = str(raw).strip().lower()
    if not trimmed:
        return None
    if trimmed not in ("auto", "local", "global"):
        raise InvalidSettaFilesLocationError(
            f"Invalid setta files location: {raw!r} (expected auto, local, or global)."
        )
    return cast("SettaFilesLocation", trimmed)


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


def _validate_setta_home_name(path: Path, *, label: str) -> None:
    if path.name in _ALLOWED_SETTA_HOME_NAMES:
        return
    allowed = ", ".join(sorted(_ALLOWED_SETTA_HOME_NAMES))
    raise InvalidSettaHomeError(
        f"{label} must end with one of: {allowed}. Received: {path}"
    )


def _validate_setta_files_root_path(path: Path) -> None:
    if any(part in _ALLOWED_SETTA_FILES_ROOT_SEGMENTS for part in path.parts):
        return
    allowed = ", ".join(sorted(_ALLOWED_SETTA_FILES_ROOT_SEGMENTS))
    raise InvalidSettaFilesRootError(
        f"Setta files root must include one of these folder names: {allowed}. Received: {path}"
    )


def _validate_runtime_root_path(*, runtime_root: Path, workspace_root: Path) -> None:
    if runtime_root == workspace_root:
        raise InvalidRuntimeRootError(
            "Runtime root cannot be the workspace root. "
            "Use a dedicated runtime directory (for example, "
            "<workspace>/setta_files/runtime or <workspace>/setta_files_dev/runtime)."
        )
