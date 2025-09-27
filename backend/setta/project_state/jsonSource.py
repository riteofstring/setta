import asyncio
import logging
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.helpers_lvl1 import get_variant_base_and_effective_section_impl
from setta.types.notifications import SettaNotification
from setta.types.section_impls import BaseDictSectionImpl

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.types.project_state import ProjectStateBackend, ProjectStateCore
    from setta.types.specific_file_watcher import FileWatcherCoreUpdate
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


class JSONSource:
    def __init__(
        self,
        websocket_msg_handler: "WMHFrontendSender",
        specific_file_watcher: "SpecificFileWatcher",
        dbe: "DBE",
    ):
        self.websocket_msg_handler = websocket_msg_handler
        self.specific_file_watcher = specific_file_watcher
        self.dbe = dbe
        self.json_sources: dict[Path, Any] = {}
        self.json_source_to_variant_mapping: dict[Path, set[str]] = defaultdict(set)

    def watch_json_source_files(
        self,
        callbackCategory: str,
        load_json_sources_fn: Callable[
            [dict[Path, Any], set[str]], Coroutine[Any, Any, None]
        ],
        project_state_backend_getter_fn: Callable[[], "ProjectStateBackend"],
    ):
        filename_set, new_json_source_to_variant_mapping = (
            self.get_json_source_files_to_watch(project_state_backend_getter_fn())
        )

        variant_ids_to_load_from_cache: set[str] = set()
        for filename, variant_ids in new_json_source_to_variant_mapping.items():
            if filename in self.json_sources:
                variant_ids_to_load_from_cache.update(
                    variant_ids.difference(
                        self.json_source_to_variant_mapping[filename]
                    )
                )

        if len(variant_ids_to_load_from_cache) > 0:
            asyncio.create_task(
                load_json_sources_fn(self.json_sources, variant_ids_to_load_from_cache)
            )

        self.json_source_to_variant_mapping = new_json_source_to_variant_mapping

        callback = self.get_json_source_file_watcher_callback(
            load_json_sources_fn, project_state_backend_getter_fn
        )
        callbacks = {k: callback for k in filename_set}

        fire_immediately = [f for f in filename_set if f not in self.json_sources]
        self.specific_file_watcher.update_callbacks(
            callbacks, callbackCategory, fire_immediately
        )

    def get_json_source_file_watcher_callback(
        self,
        load_json_sources_fn: Callable[
            [dict[Path, Any], set[str]], Coroutine[Any, Any, None]
        ],
        project_state_backend_getter_fn: Callable[[], "ProjectStateBackend"],
    ) -> FileWatcherCallback:
        async def fn(coreUpdate: "FileWatcherCoreUpdate"):
            filepath = coreUpdate.fileToRead
            self.json_sources[filepath] = self.dbe.read_json(filepath)
            project_state_backend = project_state_backend_getter_fn()
            variantsToLoad = self.get_variants_for_json_source_update(
                project_state_backend, coreUpdate
            )
            if len(variantsToLoad) > 0:
                await load_json_sources_fn(self.json_sources, variantsToLoad)
                notification = SettaNotification(
                    message=f"{coreUpdate.relPath} {coreUpdate.eventType.value}",
                )
                await self.websocket_msg_handler.broadcast_notification(notification)

        return fn

    def get_json_source_files_to_watch(self, p: "ProjectStateBackend"):
        filename_set: set[Path] = set()
        new_json_source_to_variant_mapping: dict[Path, set[str]] = defaultdict(set)
        for s in p.sections.values():
            for v in s.variants:
                variant, _, impl = get_variant_base_and_effective_section_impl(p, s, v)
                if isinstance(impl, BaseDictSectionImpl) and impl.isJsonSource:
                    filepath = Path(variant.name).resolve()
                    filename_set.add(filepath)
                    new_json_source_to_variant_mapping[filepath].add(v)

        return filename_set, new_json_source_to_variant_mapping

    def get_variants_for_json_source_update(
        self, p: "ProjectStateCore", coreUpdate: "FileWatcherCoreUpdate"
    ):
        variantsToLoad: set[str] = set()
        processed = set()
        for section in p.sections.values():
            for variant_id in section.variants:
                if variant_id in variantsToLoad:
                    continue
                processed.add(variant_id)
                variant, _, impl = get_variant_base_and_effective_section_impl(
                    p, section, variant_id
                )
                if (
                    not isinstance(impl, BaseDictSectionImpl)
                    or not impl.isJsonSource
                    or variant.name != str(coreUpdate.relPath)
                ):
                    continue

                variantsToLoad.add(variant_id)
        return variantsToLoad
