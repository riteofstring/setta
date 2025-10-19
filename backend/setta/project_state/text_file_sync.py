import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
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

    def handle_external_change(self, path: Path) -> None:
        normalized = normalize_path(path)
        binding = self._path_to_binding.get(normalized)
        if binding is None:
            logger.debug(
                "TextFileSync received change for untracked path %s", normalized
            )
            return
        logger.info(
            "TextFileSync detected external change for %s at %s",
            binding,
            normalized,
        )
        # Placeholder: future implementation will refresh the associated section.

    def watch_text_files(self, callback_category: str) -> None:
        logger.info(
            "TextFileSync watch_text_files invoked: category=%s tracked_paths=%d",
            callback_category,
            len(self._path_to_binding),
        )
        # Placeholder: update SpecificFileWatcher subscriptions in future steps.

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
            self._record_binding(binding, normalized)
            return "skipped"

        self._dbe.write(normalized, content)
        metadata.last_written_hash = content_hash
        self._record_binding(binding, normalized)
        logger.info(
            "TextFileSync wrote content for %s at %s hash=%s",
            binding,
            normalized,
            content_hash,
        )
        return "written"

    def _record_binding(self, binding: TextFileBinding, path: Path) -> None:
        self._path_to_binding[path] = binding
        self._binding_to_path[binding] = path

    def _ensure_metadata_initialized(self, path: Path) -> TextFileMetadata:
        metadata = self._path_metadata.get(path)
        if metadata is None:
            metadata = TextFileMetadata(
                last_written_hash=self._compute_file_hash(path)
            )
            self._path_metadata[path] = metadata
        return metadata

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
