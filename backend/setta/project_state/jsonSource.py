from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.helpers import get_variant_base_and_effective_section_impl
from setta.types.notifications import SettaNotification
from setta.types.section_impls import BaseDictSectionImpl

if TYPE_CHECKING:
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.types.project_state import ProjectStateBackend, ProjectStateCore
    from setta.types.specific_file_watcher import FileWatcherCoreUpdate
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class JSONSource:
    def __init__(
        self,
        websocket_msg_handler: "WMHFrontendSender",
        specific_file_watcher: "SpecificFileWatcher",
    ):
        self.websocket_msg_handler = websocket_msg_handler
        self.specific_file_watcher = specific_file_watcher
        self.json_source_to_section_mapping: dict[Path, list[str]] = {}

    def watch_json_source_files(
        self,
        load_json_sources_fn: Callable[[set[str]], Coroutine[Any, Any, None]],
        project_state_backend_getter_fn: Callable[[], "ProjectStateBackend"],
    ):
        filename_set, new_json_source_to_section_mapping = (
            self.get_json_source_files_to_watch(project_state_backend_getter_fn())
        )
        callbacks = {
            k: self.get_json_source_file_watcher_callback(
                load_json_sources_fn, project_state_backend_getter_fn
            )
            for k in filename_set
        }
        fire_immediately: list[Path] = []
        for k, v in new_json_source_to_section_mapping.items():
            if self.json_source_to_section_mapping.get(k) != v:
                fire_immediately.append(k)

        self.json_source_to_section_mapping = new_json_source_to_section_mapping
        self.specific_file_watcher.update_callbacks(
            callbacks, self.__class__.__name__, fire_immediately
        )

    def get_json_source_file_watcher_callback(
        self,
        load_json_sources_fn: Callable[[set[str]], Coroutine[Any, Any, None]],
        project_state_backend_getter_fn: Callable[[], "ProjectStateBackend"],
    ) -> FileWatcherCallback:
        async def fn(coreUpdate: "FileWatcherCoreUpdate"):
            project_state_backend = project_state_backend_getter_fn()
            variantsToLoad = self.get_variants_for_json_source_update(
                project_state_backend, coreUpdate
            )
            if len(variantsToLoad) > 0:
                await load_json_sources_fn(variantsToLoad)
                notification = SettaNotification(
                    message=f"{coreUpdate.relPath} {coreUpdate.eventType.value}",
                )
                await self.websocket_msg_handler.broadcast_notification(notification)

        return fn

    def get_json_source_files_to_watch(self, p: "ProjectStateBackend"):
        filename_set: set[Path] = set()
        json_source_to_section_mapping: dict[Path, list[str]] = defaultdict(list)
        for s in p.sections.values():
            for v in s.variants:
                variant, _, impl = get_variant_base_and_effective_section_impl(p, s, v)
                if isinstance(impl, BaseDictSectionImpl) and impl.isJsonSource:
                    filepath = Path(variant.name).resolve()
                    filename_set.add(filepath)
                    json_source_to_section_mapping[filepath].append(s.id)
        return filename_set, json_source_to_section_mapping

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
