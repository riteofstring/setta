from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.types.project_state import ProjectStateBackend
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


AccessMode = Literal["read_write", "read_only", "write_only"]


@dataclass(frozen=True)
class CodeFileBinding:
    section_id: str
    variant_id: str
    project_config_id: str | None
    access_mode: AccessMode


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
        self._bindings: dict[Path, set[CodeFileBinding]] = {}

        # Tracks callback categories the manager has registered with SpecificFileWatcher.
        self._category_to_paths: dict[str, set[Path]] = {}

    def register_binding(
        self,
        path: Path,
        binding: CodeFileBinding,
    ) -> None:
        """
        Store binding metadata so the watcher callback can reload the proper sections.

        TODO: align this with validate_code_file_bindings once the binding schema is in
        place, and ensure we normalize the path before persisting.
        """
        bucket = self._bindings.setdefault(path, set())
        bucket.add(binding)
        self._metadata.setdefault(path, CodeFileMetadata())

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

    def record_write(self, path: Path, content_hash: str) -> None:
        """
        Track the hash of writes issued by Setta so incoming watcher events can skip
        redundant reloads.

        TODO: enforce access modes (e.g., reject writes for read-only bindings) and
        coordinate with BaseProjectManager.set_code.
        """
        metadata = self._metadata.setdefault(path, CodeFileMetadata())
        metadata.last_written_hash = content_hash
        metadata.has_conflict = False

    def should_reload(self, path: Path, on_disk_hash: str | None) -> bool:
        """
        Decide whether a filesystem event should trigger reloading the section.

        TODO: compare the hash against last_written_hash/last_read_hash, update conflict
        flags, and coordinate with reload_code_sections.
        """
        metadata = self._metadata.get(path)
        if metadata is None:
            return True
        if on_disk_hash is None:
            return True
        # Placeholder logic until we wire in real hash comparisons.
        return metadata.last_written_hash != on_disk_hash
