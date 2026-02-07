import hashlib
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_WORKSPACE_ROOT_ENV = "SETTA_WORKSPACE_ROOT"
_FILES_ROOT_ENV = "SETTA_FILES_ROOT"
_FILES_ROOT_BASE_ENV = "SETTA_FILES_ROOT_BASE"
_RUNTIME_ROOT_ENV = "SETTA_RUNTIME_ROOT"

_LEAF_ALLOWED_RE = re.compile(r"[A-Za-z0-9._-]+")


@dataclass(frozen=True)
class SettaPaths:
    workspace_root: Path
    setta_files_root: Path
    runtime_root: Path

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


def resolve_setta_paths(
    *,
    workspace_root: Path | str | None = None,
    files_root: Path | str | None = None,
    files_root_base: Path | str | None = None,
    runtime_root: Path | str | None = None,
    ignore_env_files_root: bool = False,
) -> SettaPaths:
    resolved_workspace = _resolve_workspace_root(workspace_root)
    resolved_files_root = _resolve_files_root(
        resolved_workspace,
        files_root=files_root,
        files_root_base=files_root_base,
        ignore_env_files_root=ignore_env_files_root,
    )
    resolved_runtime_root = _resolve_runtime_root(
        resolved_files_root, runtime_root=runtime_root
    )
    return SettaPaths(
        workspace_root=resolved_workspace,
        setta_files_root=resolved_files_root,
        runtime_root=resolved_runtime_root,
    )


@lru_cache(maxsize=1)
def get_setta_paths() -> SettaPaths:
    return resolve_setta_paths()


def clear_setta_paths_cache() -> None:
    get_setta_paths.cache_clear()


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


def build_files_root_from_base(base_root: Path, workspace_root: Path) -> Path:
    sanitized_leaf = _sanitize_leaf(workspace_root.name)
    digest = hashlib.sha256(str(workspace_root).encode("utf-8")).hexdigest()[:8]
    return base_root / f"{sanitized_leaf}-{digest}"


def warn_on_legacy_state(
    *,
    workspace_root: Path,
    setta_files_root: Path,
    logger,
) -> None:
    legacy_root = (workspace_root / "setta_files").resolve(strict=False)
    if legacy_root == setta_files_root:
        return
    legacy_exists = legacy_root.exists()
    if not legacy_exists:
        return
    new_root_has_contents = setta_files_root.exists() and any(
        setta_files_root.iterdir()
    )
    if new_root_has_contents:
        return
    logger.warning(
        "Detected existing state at %s. To reuse it, start Setta with: "
        "setta --workspace %s --files-root %s",
        legacy_root,
        workspace_root,
        legacy_root,
    )


def _resolve_workspace_root(workspace_root: Path | str | None) -> Path:
    raw = workspace_root or os.environ.get(_WORKSPACE_ROOT_ENV) or Path.cwd()
    return resolve_path(raw)


def _resolve_files_root(
    workspace_root: Path,
    *,
    files_root: Path | str | None,
    files_root_base: Path | str | None,
    ignore_env_files_root: bool,
) -> Path:
    raw_files_root: Path | str | None = files_root
    if isinstance(raw_files_root, str):
        raw_files_root = raw_files_root.strip() or None

    raw_files_root_base: Path | str | None = files_root_base
    if isinstance(raw_files_root_base, str):
        raw_files_root_base = raw_files_root_base.strip() or None

    raw_env_files_root: str | None = None
    if not ignore_env_files_root:
        raw_env_files_root = os.environ.get(_FILES_ROOT_ENV)
        if raw_env_files_root is not None:
            raw_env_files_root = raw_env_files_root.strip() or None

    raw_env_files_root_base = os.environ.get(_FILES_ROOT_BASE_ENV)
    if raw_env_files_root_base is not None:
        raw_env_files_root_base = raw_env_files_root_base.strip() or None

    # Precedence:
    # 1. explicit --files-root
    # 2. explicit --files-root-base
    # 3. SETTA_FILES_ROOT (unless ignored)
    # 4. SETTA_FILES_ROOT_BASE
    # 5. workspace_root/setta_files
    if raw_files_root is not None:
        return resolve_path(raw_files_root)
    if raw_files_root_base is not None:
        base_root = resolve_path(raw_files_root_base)
        return build_files_root_from_base(base_root, workspace_root).resolve(
            strict=False
        )
    if raw_env_files_root is not None:
        return resolve_path(raw_env_files_root)
    if raw_env_files_root_base is not None:
        base_root = resolve_path(raw_env_files_root_base)
        return build_files_root_from_base(base_root, workspace_root).resolve(
            strict=False
        )
    return (workspace_root / "setta_files").resolve(strict=False)


def _resolve_runtime_root(
    setta_files_root: Path, *, runtime_root: Path | str | None
) -> Path:
    raw = runtime_root or os.environ.get(_RUNTIME_ROOT_ENV)
    if raw:
        return resolve_path(raw)
    return (setta_files_root / "runtime").resolve(strict=False)


def resolve_path(raw: Path | str) -> Path:
    if isinstance(raw, Path):
        raw_value = str(raw)
    else:
        raw_value = raw
    expanded = os.path.expandvars(os.path.expanduser(raw_value))
    return Path(expanded).resolve(strict=False)


def _sanitize_leaf(value: str) -> str:
    if not value:
        return "workspace"
    cleaned = "".join(ch if _LEAF_ALLOWED_RE.fullmatch(ch) else "_" for ch in value)
    cleaned = cleaned.strip("._-")
    return cleaned or "workspace"
