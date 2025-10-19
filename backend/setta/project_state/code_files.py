from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.types.project_state import ProjectStateBackend
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

from setta.types.section_impls import CodeFileAccessMode
from setta.utils.utils import normalize_path


@dataclass(frozen=True)
class RegisteredCodeFileBinding:
    section_id: str
    variant_id: str
    project_config_id: str | None
    access_mode: CodeFileAccessMode


@dataclass
class CodeFileMetadata:
    last_read_hash: str | None = None
    last_written_hash: str | None = None
    has_conflict: bool = False


class CodeFiles:
    """
    Central manager for code file bindings. The real implementation will mirror the
    structure used by Artifacts and JSONSource so that callbacks, metadata, and reloads
    stay consistent across file types.
    """

    def __init__(
        self,
        websocket_msg_handler: WMHFrontendSender,
        specific_file_watcher: SpecificFileWatcher,
        dbe: DBE,
    ):
        self.websocket_msg_handler = websocket_msg_handler
        self.specific_file_watcher = specific_file_watcher
        self.dbe = dbe

        # Maps canonical paths to both binding metadata and section/variant ownership.
        self._metadata: dict[Path, CodeFileMetadata] = {}
        self._bindings: dict[Path, set[RegisteredCodeFileBinding]] = {}

        # Tracks callback categories the manager has registered with SpecificFileWatcher.
        self._category_to_paths: dict[str, set[Path]] = {}

    def register_binding(
        self,
        path: Path,
        binding: RegisteredCodeFileBinding,
    ) -> None:
        """
        Store binding metadata so the watcher callback can reload the proper sections.

        TODO: align this with validate_code_file_bindings once the binding schema is in
        place, and ensure we normalize the path before persisting.
        """
        normalized = normalize_path(path)
        bucket = self._bindings.setdefault(normalized, set())
        existing_modes: set[CodeFileAccessMode] = {b.access_mode for b in bucket}
        if existing_modes and binding.access_mode not in existing_modes:
            raise ValueError(
                f"Conflicting access_mode for {normalized}: "
                f"{sorted(mode.value for mode in existing_modes)} vs {binding.access_mode.value}"
            )
        bucket.add(binding)
        self._metadata.setdefault(normalized, CodeFileMetadata())

    def get_bindings(self, path: Path) -> set[RegisteredCodeFileBinding]:
        """Return the registered bindings for `path`."""
        normalized = normalize_path(path)
        return set(self._bindings.get(normalized, set()))

    def get_metadata(self, path: Path) -> CodeFileMetadata | None:
        """Return metadata for `path` if registered."""
        normalized = normalize_path(path)
        return self._metadata.get(normalized)

    def watch_code_files(
        self,
        callback_category: str,
        project_state_backend: ProjectStateBackend,
    ) -> None:
        """
        Register callbacks with SpecificFileWatcher for any paths tracked under this
        category. Mirrors watch_json_source_files/watch_artifact_files.

        TODO: compute the per-category path set, diff with previous registrations, and
        call SpecificFileWatcher.update_callbacks just like the existing managers.
        """
        self._category_to_paths.setdefault(callback_category, set())
        # TODO: derive callbacks once CodeFiles.reload_code_sections exists.

    def record_read(self, path: Path, content_hash: str | None) -> None:
        """
        Update read metadata after Setta ingests fresh on-disk contents.
        """
        normalized = normalize_path(path)
        self._ensure_registered(normalized)
        metadata = self._metadata.setdefault(normalized, CodeFileMetadata())
        metadata.last_read_hash = content_hash
        metadata.has_conflict = False

    def record_write(self, path: Path, content_hash: str) -> None:
        """
        Track the hash of writes issued by Setta so incoming watcher events can skip
        redundant reloads.

        TODO: enforce access modes (e.g., reject writes for read-only bindings) and
        coordinate with BaseProjectManager.set_code.
        """
        normalized = normalize_path(path)
        self._ensure_registered(normalized)
        access_mode = self._resolve_access_mode(normalized)
        if access_mode == CodeFileAccessMode.read_only:
            raise PermissionError(
                f"Writes are forbidden for read-only file {normalized}"
            )

        metadata = self._metadata.setdefault(normalized, CodeFileMetadata())
        metadata.last_written_hash = content_hash
        metadata.has_conflict = False

    def should_reload(self, path: Path, on_disk_hash: str | None) -> bool:
        """
        Decide whether a filesystem event should trigger reloading the section.

        TODO: compare the hash against last_written_hash/last_read_hash, update conflict
        flags, and coordinate with reload_code_sections.
        """
        normalized = normalize_path(path)
        self._ensure_registered(normalized)

        metadata = self._metadata.setdefault(normalized, CodeFileMetadata())
        access_mode = self._resolve_access_mode(normalized)

        if access_mode == CodeFileAccessMode.write_only:
            self._maybe_mark_conflict_for_write_only(metadata, on_disk_hash)
            return False

        if on_disk_hash is None:
            metadata.has_conflict = metadata.last_written_hash is not None
            metadata.last_read_hash = None
            return True

        if metadata.last_written_hash == on_disk_hash:
            metadata.last_read_hash = on_disk_hash
            metadata.has_conflict = False
            return False

        if metadata.last_read_hash == on_disk_hash:
            return False

        metadata.has_conflict = (
            metadata.last_written_hash is not None
            and metadata.last_written_hash != on_disk_hash
        )
        return True

    def _maybe_mark_conflict_for_write_only(
        self, metadata: CodeFileMetadata, on_disk_hash: str | None
    ) -> None:
        if (
            on_disk_hash is None
            or metadata.last_written_hash is None
            or metadata.last_written_hash == on_disk_hash
        ):
            metadata.has_conflict = False
            return
        metadata.has_conflict = True

    def _resolve_access_mode(self, normalized_path: Path) -> CodeFileAccessMode:
        bindings = self._bindings.get(normalized_path, set())
        if not bindings:
            raise KeyError(f"No bindings registered for {normalized_path}")
        modes = {binding.access_mode for binding in bindings}
        if len(modes) == 1:
            return next(iter(modes))
        if CodeFileAccessMode.read_write in modes:
            return CodeFileAccessMode.read_write
        raise ValueError(
            f"Conflicting access_modes for {normalized_path}: "
            f"{sorted(mode.value for mode in modes)}"
        )

    def _ensure_registered(self, normalized_path: Path) -> None:
        if normalized_path not in self._bindings:
            raise KeyError(f"No bindings registered for {normalized_path}")
