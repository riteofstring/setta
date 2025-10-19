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
