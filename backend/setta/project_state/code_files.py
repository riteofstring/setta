from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine

from setta.types.id import ID

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.helpers_lvl1 import get_variant_base_and_effective_section_impl
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.section_impls import BaseCodeSectionImpl, CodeFileAccessMode
from setta.types.specific_file_watcher import FileEventType, FileWatcherCoreUpdate
from setta.utils.utils import compute_md5_hex, normalize_path

GEN_CODE_SECTION_ID = ID("__setta_gen_code__")
GEN_CODE_VARIANT_ID = ID("__setta_gen_code__")


@dataclass(frozen=True)
class RegisteredCodeFileBinding:
    section_id: ID
    variant_id: ID
    project_config_id: ID
    access_mode: CodeFileAccessMode


@dataclass(frozen=True)
class CodeFileReloadPlan:
    path: Path
    raw_content: str | None
    content_hash: str | None
    bindings_by_config: dict[ID, list[RegisteredCodeFileBinding]]
    core_update: FileWatcherCoreUpdate


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
        websocket_msg_handler: "WMHFrontendSender",
        specific_file_watcher: "SpecificFileWatcher",
        dbe: "DBE",
    ):
        self.websocket_msg_handler = websocket_msg_handler
        self.specific_file_watcher = specific_file_watcher
        self.dbe = dbe

        # Maps canonical paths to both binding metadata and section/variant ownership.
        self._metadata: dict[Path, CodeFileMetadata] = {}
        self._bindings: dict[Path, set[RegisteredCodeFileBinding]] = {}

        # Tracks callback categories -> path -> bindings registered with the watcher.
        self._category_to_bindings: dict[
            str, dict[Path, set[RegisteredCodeFileBinding]]
        ] = {}

    def register_binding(
        self,
        path: Path,
        binding: RegisteredCodeFileBinding,
    ) -> None:
        """
        Store binding metadata so the watcher callback can reload the proper sections.
        """
        normalized = normalize_path(path)
        bucket = self._bindings.setdefault(normalized, set())
        to_replace = {
            existing
            for existing in bucket
            if (
                existing.section_id == binding.section_id
                and existing.variant_id == binding.variant_id
                and existing.project_config_id == binding.project_config_id
            )
        }
        if to_replace:
            bucket.difference_update(to_replace)

        existing_modes: set[CodeFileAccessMode] = {b.access_mode for b in bucket}
        if existing_modes and binding.access_mode not in existing_modes:
            raise ValueError(
                f"Conflicting access_mode for {normalized}: "
                f"{sorted(mode.value for mode in existing_modes)} vs {binding.access_mode.value}"
            )
        bucket.add(binding)
        self._metadata.setdefault(normalized, CodeFileMetadata())

    def _generate_bindings_for_config(
        self, project_state: "ProjectStateSingleConfig"
    ) -> dict[Path, set[RegisteredCodeFileBinding]]:
        project_config = project_state.projectConfig
        project_config_id = project_config.id

        new_bindings: dict[Path, set[RegisteredCodeFileBinding]] = {}

        for section_id, core in project_state.sections.items():
            variant_id = project_config.sectionVariantMap.get(section_id)
            if variant_id is None:
                continue
            _, _, impl = get_variant_base_and_effective_section_impl(
                project_state, core, variant_id
            )
            if not isinstance(impl, BaseCodeSectionImpl):
                continue
            binding = impl.codeFileBinding
            if binding is None:
                continue

            registered_binding = RegisteredCodeFileBinding(
                section_id=section_id,
                variant_id=variant_id,
                project_config_id=project_config_id,
                access_mode=binding.access_mode,
            )
            normalized = normalize_path(binding.canonical_path)
            new_bindings.setdefault(normalized, set()).add(registered_binding)

        gen_code_binding = project_state.genCodeBinding
        if gen_code_binding is not None:
            registered_gen_binding = RegisteredCodeFileBinding(
                section_id=GEN_CODE_SECTION_ID,
                variant_id=GEN_CODE_VARIANT_ID,
                project_config_id=project_config_id,
                access_mode=gen_code_binding.access_mode,
            )
            normalized = normalize_path(gen_code_binding.canonical_path)
            new_bindings.setdefault(normalized, set()).add(registered_gen_binding)

        return new_bindings

    def _replace_bindings_for_config(
        self,
        project_config_id: ID,
        new_bindings: dict[Path, set[RegisteredCodeFileBinding]],
    ) -> bool:
        previous_bindings: dict[Path, set[RegisteredCodeFileBinding]] = {}
        for path, bindings in self._bindings.items():
            relevant = {
                binding
                for binding in bindings
                if binding.project_config_id == project_config_id
            }
            if relevant:
                previous_bindings[path] = relevant

        if previous_bindings == new_bindings:
            return False

        # Drop bindings for this config before re-registering with the new snapshot.
        paths_to_cleanup = set(previous_bindings.keys())
        for path in paths_to_cleanup:
            bucket = self._bindings.get(path)
            if not bucket:
                continue
            bucket -= previous_bindings[path]
            if bucket:
                self._bindings[path] = bucket
            else:
                self._bindings.pop(path, None)
                self._metadata.pop(path, None)

        if paths_to_cleanup:
            categories = list(self._category_to_bindings.items())
            for callback_category, path_map in categories:
                updated_map = dict(path_map)
                mutated = False
                for path in paths_to_cleanup:
                    bindings = updated_map.get(path)
                    if not bindings:
                        continue
                    pruned = {
                        binding
                        for binding in bindings
                        if binding.project_config_id != project_config_id
                    }
                    if pruned:
                        updated_map[path] = pruned
                    else:
                        updated_map.pop(path, None)
                    mutated = True
                if mutated:
                    if updated_map:
                        self._category_to_bindings[callback_category] = updated_map
                    else:
                        self._category_to_bindings.pop(callback_category, None)

        for path, bindings in new_bindings.items():
            for binding in bindings:
                self.register_binding(path, binding)

        return True

    def get_bindings(self, path: Path) -> set[RegisteredCodeFileBinding]:
        """Return the registered bindings for `path`."""
        normalized = normalize_path(path)
        return set(self._bindings.get(normalized, set()))

    def get_metadata(self, path: Path) -> CodeFileMetadata | None:
        """Return metadata for `path` if registered."""
        normalized = normalize_path(path)
        return self._metadata.get(normalized)

    def get_access_mode(self, path: Path) -> CodeFileAccessMode:
        normalized = normalize_path(path)
        self._ensure_registered(normalized)
        return self._resolve_access_mode(normalized)

    def watch_code_files(
        self,
        callback_category: str,
        project_state_backend_getter_fn: Callable[[], "ProjectStateBackend"],
        reload_code_sections: Callable[[CodeFileReloadPlan], Coroutine[Any, Any, None]],
    ) -> None:
        """
        Register callbacks with SpecificFileWatcher for any paths tracked under this
        category. Mirrors watch_json_source_files/watch_artifact_files.
        """
        previous_paths = set(self._get_category_bindings(callback_category))
        project_state_backend = project_state_backend_getter_fn()
        self._refresh_bindings_from_backend(project_state_backend)
        category_bindings = self._collect_bindings_for_backend(project_state_backend)

        current_paths = set(category_bindings)
        if current_paths:
            self._category_to_bindings[callback_category] = {
                path: set(bindings) for path, bindings in category_bindings.items()
            }
        elif callback_category in self._category_to_bindings:
            del self._category_to_bindings[callback_category]

        callback = self._build_file_watcher_callback(
            callback_category,
            reload_code_sections,
        )
        callbacks = {path: callback for path in current_paths}

        fire_immediately = {
            path for path in current_paths if path not in previous_paths
        }
        self.specific_file_watcher.update_callbacks(
            callbacks, callback_category, fire_immediately
        )

    def _refresh_bindings_from_backend(
        self, project_state_backend: "ProjectStateBackend"
    ) -> None:
        active_config_ids = set(project_state_backend.projectConfigs.keys())

        for project_config_id in active_config_ids:
            single_config = convert_backend_to_single_config(
                project_state_backend, project_config_id
            )
            bindings = self._generate_bindings_for_config(single_config)
            self._replace_bindings_for_config(project_config_id, bindings)

        existing_config_ids = self._collect_config_ids()
        removed_config_ids = existing_config_ids - active_config_ids
        for project_config_id in removed_config_ids:
            self._replace_bindings_for_config(project_config_id, {})

    def _collect_config_ids(self):
        config_ids: set[ID] = set()
        for bindings in self._bindings.values():
            for binding in bindings:
                config_ids.add(binding.project_config_id)
        return config_ids

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

    def _collect_bindings_for_backend(
        self, project_state_backend: "ProjectStateBackend"
    ) -> dict[Path, set[RegisteredCodeFileBinding]]:
        project_config_ids = set(project_state_backend.projectConfigs.keys())
        category_bindings: dict[Path, set[RegisteredCodeFileBinding]] = {}

        for path, bindings in self._bindings.items():
            relevant = {
                binding
                for binding in bindings
                if binding.project_config_id in project_config_ids
            }
            if relevant:
                category_bindings[path] = relevant

        return category_bindings

    def _get_category_bindings(
        self, callback_category: str
    ) -> dict[Path, set[RegisteredCodeFileBinding]]:
        return self._category_to_bindings.get(callback_category, {})

    def _build_file_watcher_callback(
        self,
        callback_category: str,
        reload_code_sections: Callable[[CodeFileReloadPlan], Coroutine[Any, Any, None]],
    ) -> FileWatcherCallback:
        async def _callback(core_update: FileWatcherCoreUpdate) -> None:
            normalized_path = normalize_path(core_update.fileToRead)
            bindings = self._get_category_bindings(callback_category).get(
                normalized_path, set()
            )
            if not bindings:
                return None

            raw_content: str | None = None
            if core_update.eventType != FileEventType.deleted:
                raw_content = self._read_text_content(core_update.fileToRead)

            content_hash: str | None = None
            if raw_content is not None:
                content_hash = compute_md5_hex(raw_content)

            if not self.should_reload(normalized_path, content_hash):
                return None

            bindings_by_config = self._group_bindings_by_config(bindings)
            if not bindings_by_config:
                return None

            plan = CodeFileReloadPlan(
                path=normalized_path,
                raw_content=raw_content,
                content_hash=content_hash,
                bindings_by_config=bindings_by_config,
                core_update=core_update,
            )
            await reload_code_sections(plan)

        return _callback

    def _read_text_content(self, path: Path) -> str | None:
        raw = self.dbe.read(path)
        if raw in (None, b"", ""):
            return None
        return str(raw)

    def _group_bindings_by_config(self, bindings: set[RegisteredCodeFileBinding]):
        grouped: dict[ID, list[RegisteredCodeFileBinding]] = {}
        for binding in bindings:
            if binding.section_id == GEN_CODE_SECTION_ID:
                continue
            grouped.setdefault(binding.project_config_id, []).append(binding)
        return grouped
