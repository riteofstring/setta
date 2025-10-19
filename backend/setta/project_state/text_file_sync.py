import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Coroutine, Iterable, Literal

from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.types.specific_file_watcher import FileEventType, FileWatcherCoreUpdate
from setta.utils.utils import normalize_path

logger = logging.getLogger(__name__)


SyncMode = Literal["project", "twoWay"]


@dataclass(frozen=True)
class TextFileBinding:
    project_config_id: str
    section_id: str
    variant_id: str


@dataclass(frozen=True)
class TextSectionBinding:
    project_config_id: str
    section_id: str
    variant_id: str
    helper_id: str
    path: Path | None
    sync_mode: SyncMode


@dataclass
class TextFileMetadata:
    last_written_hash: str | None = None
    last_observed_hash: str | None = None
    is_missing: bool = False


@dataclass(frozen=True)
class TextFileExternalChange:
    binding: TextFileBinding
    path: Path
    event_type: FileEventType
    content: str | None
    file_missing: bool


TextFileExternalChangeHandler = Callable[
    [TextFileExternalChange], Coroutine[Any, Any, None]
]
_TextFileWatcherCallback = Callable[[FileWatcherCoreUpdate], Coroutine[Any, Any, None]]


class TextFileSync:
    """Prototype manager that logs section-to-file mappings."""

    def __init__(
        self,
        specific_file_watcher: SpecificFileWatcher,
        dbe: DBE,
    ):
        self._specific_file_watcher = specific_file_watcher
        self._dbe = dbe
        self._path_to_binding: dict[Path, TextFileBinding] = {}
        self._binding_to_path: dict[TextFileBinding, Path] = {}
        self._path_metadata: dict[Path, TextFileMetadata] = {}
        self._category_tracked_paths: dict[str, set[Path]] = {}

    def register_sections(
        self,
        bindings: Iterable[TextSectionBinding],
    ) -> None:
        for binding in bindings:
            binding_key = TextFileBinding(
                project_config_id=binding.project_config_id,
                section_id=binding.section_id,
                variant_id=binding.variant_id,
            )
            helper_id = binding.helper_id
            file_path = binding.path
            sync_mode = binding.sync_mode
            if file_path is None or sync_mode != "twoWay":
                self._discard_binding(binding_key)
                logger.debug(
                    "TextFileSync skipping registration: %s helper=%s mode=%s path=%s",
                    binding_key,
                    helper_id,
                    sync_mode,
                    file_path,
                )
                continue

            normalized = normalize_path(file_path)
            existing = self._path_to_binding.get(normalized)
            if existing and existing != binding_key:
                logger.warning(
                    "TextFileSync path conflict: %s already bound to %s; ignoring %s/%s helpers",
                    normalized,
                    existing,
                    binding_key,
                    helper_id,
                )
                continue

            self._path_to_binding[normalized] = binding_key
            self._binding_to_path[binding_key] = normalized
            logger.info(
                "TextFileSync registered %s helper=%s path=%s",
                binding_key,
                helper_id,
                normalized,
            )
            self._ensure_metadata_initialized(normalized)

    def unregister_project_config(self, project_config_id: str) -> None:
        to_remove = [
            binding
            for binding in self._binding_to_path.keys()
            if binding.project_config_id == project_config_id
        ]
        for binding in to_remove:
            self._discard_binding(binding)
            logger.info("TextFileSync unregistered %s", binding)

    def _discard_binding(self, binding: TextFileBinding) -> None:
        path = self._binding_to_path.pop(binding, None)
        if path:
            self._path_to_binding.pop(path, None)

    def watch_text_files(
        self,
        callback_category: str,
        project_config_ids: Iterable[str],
        on_external_change: TextFileExternalChangeHandler,
    ) -> None:
        tracked_config_ids = set(project_config_ids)
        relevant_bindings: dict[Path, TextFileBinding] = {}
        for path, binding in self._path_to_binding.items():
            if binding.project_config_id in tracked_config_ids:
                relevant_bindings[path] = binding

        callbacks: dict[Path, _TextFileWatcherCallback] = {}
        for path, binding in relevant_bindings.items():
            callbacks[path] = self._create_watcher_callback(binding, on_external_change)

        previous_paths = self._category_tracked_paths.get(callback_category, set())
        fire_immediately = {
            path for path in relevant_bindings.keys() if path not in previous_paths
        }
        self._category_tracked_paths[callback_category] = set(relevant_bindings.keys())
        self._specific_file_watcher.update_callbacks(
            callbacks, callback_category, fire_immediately
        )
        logger.info(
            "TextFileSync watch_text_files updated: category=%s tracked_paths=%d fire_immediate=%d",
            callback_category,
            len(callbacks),
            len(fire_immediately),
        )

    def write_section_code(
        self,
        binding: TextFileBinding,
        path: Path,
        content: str,
    ) -> Literal["written", "skipped"]:
        normalized = normalize_path(path)
        content_hash = self._compute_hash(content.encode("utf-8"))
        metadata = self._ensure_metadata_initialized(normalized)
        if metadata.last_written_hash == content_hash:
            logger.debug(
                "TextFileSync skipping write for %s at %s (hash unchanged)",
                binding,
                normalized,
            )
            metadata.last_observed_hash = content_hash
            metadata.is_missing = False
            self._record_binding(binding, normalized)
            return "skipped"

        self._dbe.write(normalized, content)
        metadata.last_written_hash = content_hash
        metadata.last_observed_hash = content_hash
        metadata.is_missing = False
        self._record_binding(binding, normalized)
        logger.info(
            "TextFileSync wrote content for %s at %s hash=%s",
            binding,
            normalized,
            content_hash,
        )
        return "written"

    def read_file(self, path: Path) -> str | None:
        normalized = normalize_path(path)
        metadata = self._ensure_metadata_initialized(normalized)
        try:
            content = self._dbe.read(normalized)
        except Exception:
            logger.exception("TextFileSync failed to read file %s", normalized)
            metadata.is_missing = True
            metadata.last_observed_hash = None
            return None

        if content is None:
            metadata.is_missing = True
            metadata.last_observed_hash = None
            return None

        if not isinstance(content, str):
            content = content.decode("utf-8")

        content_hash = self._compute_hash(content.encode("utf-8"))
        metadata.last_observed_hash = content_hash
        metadata.is_missing = False
        return content

    def _record_binding(self, binding: TextFileBinding, path: Path) -> None:
        self._path_to_binding[path] = binding
        self._binding_to_path[binding] = path

    def _ensure_metadata_initialized(self, path: Path) -> TextFileMetadata:
        metadata = self._path_metadata.get(path)
        if metadata is None:
            existing_hash = self._compute_file_hash(path)
            metadata = TextFileMetadata(
                last_written_hash=None,
                last_observed_hash=existing_hash,
                is_missing=existing_hash is None,
            )
            self._path_metadata[path] = metadata
        return metadata

    def _create_watcher_callback(
        self,
        binding: TextFileBinding,
        on_external_change: TextFileExternalChangeHandler,
    ) -> _TextFileWatcherCallback:
        async def callback(core_update: FileWatcherCoreUpdate) -> None:
            await self._handle_core_update(binding, core_update, on_external_change)

        return callback

    async def _handle_core_update(
        self,
        expected_binding: TextFileBinding,
        core_update: FileWatcherCoreUpdate,
        on_external_change: TextFileExternalChangeHandler,
    ) -> None:
        normalized_path = normalize_path(core_update.fileToRead)
        current_binding = self._path_to_binding.get(normalized_path)
        if current_binding is None:
            logger.debug(
                "TextFileSync received change for untracked path %s", normalized_path
            )
            return
        if current_binding != expected_binding:
            logger.debug(
                "TextFileSync binding mismatch for %s: expected=%s actual=%s",
                normalized_path,
                expected_binding,
                current_binding,
            )
            return

        metadata = self._ensure_metadata_initialized(normalized_path)
        file_missing = False
        content: str | None = None

        if core_update.eventType == FileEventType.deleted:
            file_missing = True
            metadata.is_missing = True
            metadata.last_observed_hash = None
            metadata.last_written_hash = None
        else:
            try:
                disk_content = self._dbe.read(normalized_path)
            except Exception:
                logger.exception(
                    "TextFileSync failed to read file %s for binding %s",
                    normalized_path,
                    expected_binding,
                )
                file_missing = True
            else:
                if disk_content is None:
                    file_missing = True
                else:
                    if not isinstance(disk_content, str):
                        disk_content = disk_content.decode("utf-8")
                    content = disk_content
                    content_hash = self._compute_hash(content.encode("utf-8"))
                    metadata.last_observed_hash = content_hash
                    metadata.is_missing = False
                    if (
                        metadata.last_written_hash is not None
                        and metadata.last_written_hash == content_hash
                        and core_update.eventType != FileEventType.readRequested
                    ):
                        logger.debug(
                            "TextFileSync skipping change for %s (hash matches last write)",
                            normalized_path,
                        )
                        return
                    if metadata.last_written_hash != content_hash:
                        metadata.last_written_hash = None

        if file_missing:
            metadata.is_missing = True
            metadata.last_observed_hash = None
            metadata.last_written_hash = None

        change = TextFileExternalChange(
            binding=current_binding,
            path=normalized_path,
            event_type=core_update.eventType,
            content=content,
            file_missing=file_missing,
        )
        await on_external_change(change)

    def _compute_hash(self, data: bytes) -> str:
        return hashlib.md5(data).hexdigest()

    def _compute_file_hash(self, path: Path) -> str | None:
        try:
            existing = self._dbe.read(path, mode="rb")
        except FileNotFoundError:
            return None
        if existing is None:
            return None
        return self._compute_hash(existing)
