import json
import os
import secrets
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator, TextIO

from setta.launcher_metadata import resolve_launcher_dir

_RECENT_WORKSPACES_FILE_NAME = "recent-workspaces.json"
_RECENT_WORKSPACES_LOCK_FILE_NAME = ".recent-workspaces.lock"
_MAX_RECENT_WORKSPACES = 50


class LauncherWorkspaceStoreError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class LauncherWorkspaceEntry:
    workspace_root: Path
    pinned: bool
    last_used_at: int

    def to_payload(self) -> dict[str, object]:
        return {
            "workspaceRoot": str(self.workspace_root),
            "pinned": self.pinned,
            "lastUsedAt": self.last_used_at,
        }


def resolve_recent_workspaces_path(*, setta_home: Path) -> Path:
    launcher_dir = resolve_launcher_dir(setta_home=setta_home)
    return (launcher_dir / _RECENT_WORKSPACES_FILE_NAME).resolve(strict=False)


def resolve_recent_workspaces_lock_path(*, setta_home: Path) -> Path:
    launcher_dir = resolve_launcher_dir(setta_home=setta_home)
    return (launcher_dir / _RECENT_WORKSPACES_LOCK_FILE_NAME).resolve(strict=False)


def load_recent_workspaces(*, setta_home: Path) -> list[LauncherWorkspaceEntry]:
    path = resolve_recent_workspaces_path(setta_home=setta_home)
    lock_path = resolve_recent_workspaces_lock_path(setta_home=setta_home)
    allowed_roots = launcher_allowed_roots()
    with _acquire_recent_workspaces_lock(lock_path):
        entries = _load_recent_workspaces_from_path(path)
        return _enforce_allowed_root_closure(
            path=path,
            entries=entries,
            allowed_roots=allowed_roots,
        )


def _load_recent_workspaces_from_path(path: Path) -> list[LauncherWorkspaceEntry]:
    if not path.exists():
        return []
    try:
        raw_payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LauncherWorkspaceStoreError(
            "LauncherWorkspaceStore",
            f"Invalid launcher recent-workspaces JSON: {path}",
        ) from exc
    except OSError as exc:
        raise LauncherWorkspaceStoreError(
            "LauncherWorkspaceStore",
            f"Failed reading launcher recent-workspaces file: {path}: {exc}",
        ) from exc

    return _normalize_workspace_entries(raw_payload)


def write_recent_workspaces(
    *,
    setta_home: Path,
    entries: list[LauncherWorkspaceEntry],
) -> Path:
    path = resolve_recent_workspaces_path(setta_home=setta_home)
    lock_path = resolve_recent_workspaces_lock_path(setta_home=setta_home)
    allowed_roots = launcher_allowed_roots()
    sorted_entries = _sort_and_limit_entries(entries)
    filtered_entries = _filter_entries_within_allowed_roots(
        entries=sorted_entries,
        allowed_roots=allowed_roots,
    )
    try:
        with _acquire_recent_workspaces_lock(lock_path):
            _write_recent_workspaces_atomic(path=path, entries=filtered_entries)
    except LauncherWorkspaceStoreError:
        raise
    return path


def upsert_recent_workspace(
    *,
    setta_home: Path,
    workspace_root: Path,
    pinned: bool | None = None,
    last_used_at: int | None = None,
) -> list[LauncherWorkspaceEntry]:
    normalized_workspace_root = workspace_root.expanduser().resolve(strict=False)
    next_timestamp = _normalize_timestamp(last_used_at)

    def apply_update(
        entries: list[LauncherWorkspaceEntry],
    ) -> list[LauncherWorkspaceEntry]:
        existing_by_path: dict[str, LauncherWorkspaceEntry] = {
            str(entry.workspace_root): entry for entry in entries
        }
        key = str(normalized_workspace_root)
        previous = existing_by_path.get(key)
        if previous is None:
            next_entry = LauncherWorkspaceEntry(
                workspace_root=normalized_workspace_root,
                pinned=bool(pinned) if pinned is not None else False,
                last_used_at=next_timestamp,
            )
        else:
            next_entry = LauncherWorkspaceEntry(
                workspace_root=normalized_workspace_root,
                pinned=previous.pinned if pinned is None else bool(pinned),
                last_used_at=max(previous.last_used_at, next_timestamp),
            )

        existing_by_path[key] = next_entry
        return list(existing_by_path.values())

    return _update_recent_workspaces(
        setta_home=setta_home,
        apply_update=apply_update,
    )


def remove_recent_workspace(
    *,
    setta_home: Path,
    workspace_root: Path,
) -> list[LauncherWorkspaceEntry]:
    normalized_workspace_root = workspace_root.expanduser().resolve(strict=False)

    def apply_update(
        entries: list[LauncherWorkspaceEntry],
    ) -> list[LauncherWorkspaceEntry]:
        return [
            entry
            for entry in entries
            if entry.workspace_root != normalized_workspace_root
        ]

    return _update_recent_workspaces(
        setta_home=setta_home,
        apply_update=apply_update,
    )


def set_recent_workspace_pinned(
    *,
    setta_home: Path,
    workspace_root: Path,
    pinned: bool,
) -> list[LauncherWorkspaceEntry]:
    normalized_workspace_root = workspace_root.expanduser().resolve(strict=False)

    def apply_update(
        entries: list[LauncherWorkspaceEntry],
    ) -> list[LauncherWorkspaceEntry]:
        next_entries: list[LauncherWorkspaceEntry] = []
        found = False
        for entry in entries:
            if entry.workspace_root == normalized_workspace_root:
                found = True
                next_entries.append(
                    LauncherWorkspaceEntry(
                        workspace_root=entry.workspace_root,
                        pinned=bool(pinned),
                        last_used_at=entry.last_used_at,
                    )
                )
            else:
                next_entries.append(entry)

        if not found:
            next_entries.append(
                LauncherWorkspaceEntry(
                    workspace_root=normalized_workspace_root,
                    pinned=bool(pinned),
                    last_used_at=_normalize_timestamp(None),
                )
            )
        return next_entries

    return _update_recent_workspaces(
        setta_home=setta_home,
        apply_update=apply_update,
    )


def launcher_allowed_roots() -> list[Path]:
    roots: list[Path] = [Path.home().expanduser().resolve(strict=False)]

    raw_extra_roots = os.environ.get("SETTA_LAUNCHER_ALLOWED_ROOTS")
    if raw_extra_roots:
        for part in raw_extra_roots.split(os.pathsep):
            trimmed = part.strip()
            if not trimmed:
                continue
            roots.append(Path(trimmed).expanduser().resolve(strict=False))

    unique_roots: list[Path] = []
    seen: set[Path] = set()
    for root in roots:
        if root in seen:
            continue
        seen.add(root)
        unique_roots.append(root)
    return unique_roots


def resolve_launcher_path_within_allowed_roots(
    *,
    raw_path: str,
    allowed_roots: list[Path],
    allow_nonexistent: bool,
) -> Path:
    trimmed = raw_path.strip()
    if not trimmed:
        raise LauncherWorkspaceStoreError(
            "BadRequest",
            "Path must be non-empty.",
        )

    resolved = Path(trimmed).expanduser().resolve(strict=False)
    if not _is_path_within_roots(path=resolved, roots=allowed_roots):
        allowed_root_text = ", ".join(str(root) for root in allowed_roots)
        raise LauncherWorkspaceStoreError(
            "PathOutsideAllowedRoots",
            (
                "Path is outside launcher allowed roots: "
                f"{resolved}. Allowed roots: {allowed_root_text}"
            ),
        )
    if not allow_nonexistent and not resolved.exists():
        raise LauncherWorkspaceStoreError(
            "PathNotFound",
            f"Path does not exist: {resolved}",
        )
    return resolved


def _normalize_workspace_entries(raw_payload: object) -> list[LauncherWorkspaceEntry]:
    if not isinstance(raw_payload, list):
        raise LauncherWorkspaceStoreError(
            "LauncherWorkspaceStore",
            "Launcher recent-workspaces payload must be a JSON array.",
        )

    by_path: dict[str, LauncherWorkspaceEntry] = {}
    for item in raw_payload:
        if not isinstance(item, dict):
            continue
        raw_workspace_root = item.get("workspaceRoot")
        if not isinstance(raw_workspace_root, str):
            continue
        trimmed_workspace_root = raw_workspace_root.strip()
        if not trimmed_workspace_root:
            continue

        workspace_root = Path(trimmed_workspace_root).expanduser().resolve(strict=False)
        raw_pinned = item.get("pinned")
        pinned = bool(raw_pinned) if isinstance(raw_pinned, bool) else False
        raw_last_used_at = item.get("lastUsedAt")
        last_used_at = _normalize_timestamp(raw_last_used_at)

        key = str(workspace_root)
        previous = by_path.get(key)
        if previous is None:
            by_path[key] = LauncherWorkspaceEntry(
                workspace_root=workspace_root,
                pinned=pinned,
                last_used_at=last_used_at,
            )
            continue

        by_path[key] = LauncherWorkspaceEntry(
            workspace_root=workspace_root,
            pinned=previous.pinned or pinned,
            last_used_at=max(previous.last_used_at, last_used_at),
        )

    return _sort_and_limit_entries(list(by_path.values()))


def _normalize_timestamp(raw_value: object | None) -> int:
    if isinstance(raw_value, int):
        if raw_value > 0:
            return raw_value
    return int(time.time())


def _sort_and_limit_entries(
    entries: list[LauncherWorkspaceEntry],
) -> list[LauncherWorkspaceEntry]:
    sorted_entries = sorted(
        entries,
        key=lambda entry: (
            not entry.pinned,
            -entry.last_used_at,
            str(entry.workspace_root),
        ),
    )
    return sorted_entries[:_MAX_RECENT_WORKSPACES]


def _is_path_within_roots(*, path: Path, roots: list[Path]) -> bool:
    for root in roots:
        if path.is_relative_to(root):
            return True
    return False


def _update_recent_workspaces(
    *,
    setta_home: Path,
    apply_update: Callable[
        [list[LauncherWorkspaceEntry]], list[LauncherWorkspaceEntry]
    ],
) -> list[LauncherWorkspaceEntry]:
    path = resolve_recent_workspaces_path(setta_home=setta_home)
    lock_path = resolve_recent_workspaces_lock_path(setta_home=setta_home)
    allowed_roots = launcher_allowed_roots()
    with _acquire_recent_workspaces_lock(lock_path):
        entries = _load_recent_workspaces_from_path(path)
        filtered_entries = _enforce_allowed_root_closure(
            path=path,
            entries=entries,
            allowed_roots=allowed_roots,
        )
        next_entries = _sort_and_limit_entries(apply_update(filtered_entries))
        next_entries = _filter_entries_within_allowed_roots(
            entries=next_entries,
            allowed_roots=allowed_roots,
        )
        _write_recent_workspaces_atomic(path=path, entries=next_entries)
        return next_entries


def _enforce_allowed_root_closure(
    *,
    path: Path,
    entries: list[LauncherWorkspaceEntry],
    allowed_roots: list[Path],
) -> list[LauncherWorkspaceEntry]:
    filtered_entries = _filter_entries_within_allowed_roots(
        entries=entries,
        allowed_roots=allowed_roots,
    )
    if len(filtered_entries) != len(entries):
        _write_recent_workspaces_atomic(path=path, entries=filtered_entries)
    return filtered_entries


def _filter_entries_within_allowed_roots(
    *,
    entries: list[LauncherWorkspaceEntry],
    allowed_roots: list[Path],
) -> list[LauncherWorkspaceEntry]:
    return [
        entry
        for entry in entries
        if _is_path_within_roots(path=entry.workspace_root, roots=allowed_roots)
    ]


def _write_recent_workspaces_atomic(
    *,
    path: Path,
    entries: list[LauncherWorkspaceEntry],
) -> None:
    payload = [entry.to_payload() for entry in entries]
    encoded_payload = json.dumps(payload, indent=2, sort_keys=True)
    temporary_path = (
        path.parent / f".{path.name}.{os.getpid()}.{secrets.token_hex(8)}.tmp"
    ).resolve(strict=False)

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path.write_text(encoded_payload, encoding="utf-8")
        os.replace(temporary_path, path)
    except OSError as exc:
        raise LauncherWorkspaceStoreError(
            "LauncherWorkspaceStore",
            f"Failed writing launcher recent-workspaces file: {path}: {exc}",
        ) from exc
    finally:
        if temporary_path.exists():
            try:
                temporary_path.unlink()
            except OSError:
                pass


@contextmanager
def _acquire_recent_workspaces_lock(lock_path: Path) -> Iterator[None]:
    try:
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with lock_path.open("a+", encoding="utf-8") as lock_file:
            _lock_file(lock_file)
            try:
                yield
            finally:
                _unlock_file(lock_file)
    except OSError as exc:
        raise LauncherWorkspaceStoreError(
            "LauncherWorkspaceStore",
            f"Failed acquiring launcher recent-workspaces lock: {lock_path}: {exc}",
        ) from exc


def _lock_file(lock_file: TextIO) -> None:
    if os.name == "nt":
        import msvcrt

        lock_file.seek(0, os.SEEK_END)
        if lock_file.tell() == 0:
            lock_file.write("0")
            lock_file.flush()
        lock_file.seek(0)
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
        return

    import fcntl

    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)


def _unlock_file(lock_file: TextIO) -> None:
    if os.name == "nt":
        import msvcrt

        lock_file.seek(0)
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        return

    import fcntl

    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
