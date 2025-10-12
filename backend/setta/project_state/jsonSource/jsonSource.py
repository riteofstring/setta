import asyncio
import copy
import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine, Iterable

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.code_obj_impls import (
    CodeObjType,
    NestedParamCodeObjImpl,
    TextParamCodeObjImpl,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.effective_impls import (
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    NestedParamCodeObjImplArgsWithCallable,
    TextParamCodeObjImplArgsWithCallable,
)
from setta.types.generated.impl_creation_fns import (
    create_code_obj_impl,
)
from setta.types.generated.unions import (
    BaseCodeObjImplUnionWithDiscriminator,
)
from setta.types.helpers_lvl1 import (
    get_variant_base_and_effective_section_impl,
)
from setta.types.hierarchy_traversal import (
    HierarchyTraversalResult,
    TraversalOptions,
    traverse_hierarchy,
)
from setta.types.notifications import SettaNotification
from setta.types.section_impls import BaseDictSectionImpl
from setta.utils.utils import normalize_path
from setta.project_state.jsonSource.save import collect_json_source_data

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.database.settings_file import SettingsFile
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.types.project_state import ProjectStateCore
    from setta.types.specific_file_watcher import FileWatcherCoreUpdate
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


@dataclass
class JSONSourceKeyValueInfo:
    codeObjs: dict[str, Core] = field(default_factory=dict)
    codeObjImpls: dict[str, BaseCodeObjImplUnionWithDiscriminator] = field(
        default_factory=dict
    )
    codeObjVariants: dict[str, Variant] = field(default_factory=dict)
    codeObjVariantMap: dict[str, str] = field(default_factory=dict)


@dataclass
class ProcessedJSONInfo:
    keyValueInfo: JSONSourceKeyValueInfo
    hierarchy: HierarchyTraversalResult


@dataclass
class JSONSourceCacheEntry:
    data: dict[str, Any]
    processed: ProcessedJSONInfo
    dirty: bool = False
    dirty_section_variants: set[tuple[str, str]] = field(default_factory=set)


class JSONSource:
    def __init__(
        self,
        websocket_msg_handler: "WMHFrontendSender",
        settings_file: "SettingsFile",
        specific_file_watcher: "SpecificFileWatcher",
        dbe: "DBE",
    ):
        self.websocket_msg_handler = websocket_msg_handler
        self.settings_file = settings_file
        self.specific_file_watcher = specific_file_watcher
        self.dbe = dbe
        self.settings_file.attach_json_source(self)
        self.json_sources: dict[Path, JSONSourceCacheEntry] = {}
        # maps from file path to set of (sectionId, variantId)
        self.json_source_to_section_variant: dict[Path, set[tuple[str, str]]] = (
            defaultdict(set)
        )

    def _clone_json_data(self, data: dict[str, Any]) -> dict[str, Any]:
        return copy.deepcopy(data)

    def _set_cache_entry(
        self,
        filepath: Path,
        data: dict[str, Any],
        *,
        dirty: bool,
        dirty_section_variants: Iterable[tuple[str, str]] | None = None,
    ) -> JSONSourceCacheEntry:
        normalized_path = normalize_path(filepath)
        data_copy = self._clone_json_data(data)
        processed = self.process_json_object(data_copy)
        entry = self.json_sources.get(normalized_path)
        if entry is None:
            entry = JSONSourceCacheEntry(
                data=data_copy,
                processed=processed,
                dirty=dirty,
            )
            if dirty and dirty_section_variants:
                entry.dirty_section_variants.update(dirty_section_variants)
            self.json_sources[normalized_path] = entry
            return entry

        entry.data = data_copy
        entry.processed = processed
        if dirty:
            entry.dirty = True
            if dirty_section_variants:
                entry.dirty_section_variants.update(dirty_section_variants)
        return entry

    def _processed_snapshot(self) -> dict[Path, ProcessedJSONInfo]:
        return {path: entry.processed for path, entry in self.json_sources.items()}

    def get_cache_entry(self, filepath: Path) -> JSONSourceCacheEntry | None:
        return self.json_sources.get(normalize_path(filepath))

    def get_cached_json(self, filepath: Path) -> dict[str, Any] | None:
        entry = self.get_cache_entry(filepath)
        return self._clone_json_data(entry.data) if entry else None

    def get_processed_json_sources(self) -> dict[Path, ProcessedJSONInfo]:
        return self._processed_snapshot()

    def get_section_variants_for_paths(
        self,
        project_state_backend: "ProjectStateCore",
        paths: Iterable[Path],
    ) -> set[tuple[str, str]]:
        result: set[tuple[str, str]] = set()
        if not paths:
            return result
        if not self.json_source_to_section_variant:
            _, mapping = self.get_json_source_files_to_watch(project_state_backend)
            self.json_source_to_section_variant = mapping
        for path in paths:
            normalized = normalize_path(path)
            result.update(self.json_source_to_section_variant.get(normalized, set()))
        return result

    def replace_file_data(
        self, filepath: Path, data: dict[str, Any], *, dirty: bool
    ) -> JSONSourceCacheEntry:
        return self._set_cache_entry(filepath, data, dirty=dirty)

    def _merge_json(self, target: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
        for key, value in updates.items():
            if (
                isinstance(value, dict)
                and isinstance(target.get(key), dict)
            ):
                self._merge_json(target[key], value)
            else:
                target[key] = self._clone_json_data(value)
        return target

    async def _load_json_sources_from_cache(
        self,
        load_json_sources_fn: Callable[
            [dict[Path, ProcessedJSONInfo], set[tuple[str, str]]],
            Coroutine[Any, Any, None],
        ],
        section_variant_ids_to_load: set[tuple[str, str]],
    ):
        if not section_variant_ids_to_load:
            return
        await load_json_sources_fn(
            self._processed_snapshot(), set(section_variant_ids_to_load)
        )

    def sync_from_backend(
        self,
        project_state_backend: "ProjectStateCore",
        *,
        treat_new_entries_as_clean: bool = False,
    ) -> set[Path]:
        new_data = {
            normalize_path(path): data
            for path, data in collect_json_source_data(
                project_state_backend, section_variant_ids=None
            ).items()
        }
        existing_paths = set(self.json_sources.keys())
        new_paths = set(new_data.keys())
        removed_paths = existing_paths - new_paths
        for path in removed_paths:
            self.json_sources.pop(path, None)

        updated_paths: set[Path] = set()
        for path, data in new_data.items():
            data_source = data
            if treat_new_entries_as_clean:
                disk_data = self.dbe.read_json(path)
                if isinstance(disk_data, dict) and disk_data:
                    data_source = disk_data
            data_copy = self._clone_json_data(data_source)
            entry = self.json_sources.get(path)
            if entry is None:
                entry = JSONSourceCacheEntry(
                    data=data_copy,
                    processed=self.process_json_object(data_copy),
                    dirty=not treat_new_entries_as_clean,
                )
                self.json_sources[path] = entry
                if entry.dirty:
                    updated_paths.add(path)
                continue

            if entry.data != data_copy:
                entry.data = data_copy
                entry.processed = self.process_json_object(data_copy)
                entry.dirty = True
                entry.dirty_section_variants.clear()
                updated_paths.add(path)

        return updated_paths

    def flush_dirty_entries(self) -> set[Path]:
        flushed_paths: set[Path] = set()
        for path, entry in self.json_sources.items():
            if not entry.dirty:
                continue
            self.dbe.write_json(path, entry.data)
            entry.dirty = False
            entry.dirty_section_variants.clear()
            flushed_paths.add(path)
        return flushed_paths

    def update_from_project_state(
        self,
        project_state: "ProjectStateCore",
        section_variants: Iterable[tuple[str, str]],
    ) -> set[Path]:
        section_variants_set = set(section_variants)
        if not section_variants_set:
            return set()

        variants_by_path: dict[Path, set[tuple[str, str]]] = defaultdict(set)
        for section_id, variant_id in section_variants_set:
            section = project_state.sections.get(section_id)
            if section is None:
                continue
            variant, _, impl = get_variant_base_and_effective_section_impl(
                project_state, section, variant_id
            )
            if (
                not isinstance(impl, BaseDictSectionImpl)
                or not impl.isJsonSource
            ):
                continue
            path = normalize_path(variant.name)
            variants_by_path[path].add((section_id, variant_id))

        variant_filter = [variant_id for _, variant_id in section_variants_set]
        data_by_path = collect_json_source_data(
            project_state, section_variant_ids=variant_filter
        )
        updated_paths: set[Path] = set()
        for path, data in data_by_path.items():
            normalized_path = normalize_path(path)
            entry = self.json_sources.get(normalized_path)
            if entry is not None:
                merged_data = self._clone_json_data(entry.data)
            else:
                try:
                    disk_data = self.dbe.read_json(normalized_path)
                except Exception:  # pragma: no cover - fallback path
                    disk_data = {}
                merged_data = disk_data if isinstance(disk_data, dict) else {}
            merged_data = self._merge_json(merged_data, data)
            self._set_cache_entry(
                normalized_path,
                merged_data,
                dirty=True,
                dirty_section_variants=variants_by_path.get(normalized_path, set()),
            )
            updated_paths.add(normalized_path)
        return updated_paths


    def watch_json_source_files(
        self,
        callbackCategory: str,
        load_json_sources_fn: Callable[
            [dict[Path, ProcessedJSONInfo], set[tuple[str, str]]],
            Coroutine[Any, Any, None],
        ],
        project_state_backend_getter_fn: Callable[[], "ProjectStateCore"],
    ):
        filename_set, new_json_source_to_section_variant = (
            self.get_json_source_files_to_watch(project_state_backend_getter_fn())
        )

        section_variant_ids_to_load: set[tuple[str, str]] = set()
        for filename, ids in new_json_source_to_section_variant.items():
            previous_ids = self.json_source_to_section_variant.get(filename, set())
            section_variant_ids_to_load.update(ids.difference(previous_ids))

        if section_variant_ids_to_load:
            asyncio.create_task(
                self._load_json_sources_from_cache(
                    load_json_sources_fn, section_variant_ids_to_load
                )
            )

        self.json_source_to_section_variant = new_json_source_to_section_variant

        callback = self.get_json_source_file_watcher_callback(
            load_json_sources_fn, project_state_backend_getter_fn
        )
        callbacks = {k: callback for k in filename_set}

        fire_immediately = {f for f in filename_set if f not in self.json_sources}
        self.specific_file_watcher.update_callbacks(
            callbacks, callbackCategory, fire_immediately
        )

    def get_json_source_file_watcher_callback(
        self,
        load_json_sources_fn: Callable[
            [dict[Path, ProcessedJSONInfo], set[tuple[str, str]]],
            Coroutine[Any, Any, None],
        ],
        project_state_backend_getter_fn: Callable[[], "ProjectStateCore"],
    ) -> FileWatcherCallback:
        async def fn(coreUpdate: "FileWatcherCoreUpdate"):
            project_state_backend = project_state_backend_getter_fn()
            sectionVariantsToLoad = self.get_section_variants_for_json_source_update(
                project_state_backend, coreUpdate
            )

            filepath = coreUpdate.fileToRead
            file_content = self.dbe.read_json(filepath)
            entry = self._set_cache_entry(filepath, file_content, dirty=False)

            grid_pattern = None
            if isinstance(entry.data, dict):
                gui_section = entry.data.get("gui")
                if isinstance(gui_section, dict):
                    grid_pattern = gui_section.get("gridPattern")

            if len(sectionVariantsToLoad) > 0:
                logger.critical(
                    "JSONSource.file_watcher event=%s file=%s grid_pattern=%s "
                    "section_variants=%s",
                    coreUpdate.eventType,
                    coreUpdate.relPath,
                    grid_pattern,
                    list(sectionVariantsToLoad),
                )
                await load_json_sources_fn(
                    self._processed_snapshot(), sectionVariantsToLoad
                )
                notification = SettaNotification(
                    message=f"{coreUpdate.relPath} {coreUpdate.eventType.value}",
                )
                await self.websocket_msg_handler.broadcast_notification(notification)

        return fn

    def get_json_source_files_to_watch(self, p: "ProjectStateCore"):
        filename_set: set[Path] = set()
        new_json_source_to_variant_mapping: dict[Path, set[tuple[str, str]]] = (
            defaultdict(set)
        )
        for s in p.sections.values():
            for v in s.variants:
                variant, _, impl = get_variant_base_and_effective_section_impl(p, s, v)
                if isinstance(impl, BaseDictSectionImpl) and impl.isJsonSource:
                    filepath = normalize_path(variant.name)
                    filename_set.add(filepath)
                    new_json_source_to_variant_mapping[filepath].add((s.id, v))

        return filename_set, new_json_source_to_variant_mapping

    def get_section_variants_for_json_source_update(
        self, p: "ProjectStateCore", coreUpdate: "FileWatcherCoreUpdate"
    ):
        sectionVariantsToLoad: set[tuple[str, str]] = set()
        processed = set()
        for section in p.sections.values():
            for variant_id in section.variants:
                if variant_id in sectionVariantsToLoad:
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

                sectionVariantsToLoad.add((section.id, variant_id))
        return sectionVariantsToLoad

    def process_json_object(self, jsonSourceData: dict):
        new_data, rootId, rootChildren = self.construct_json_source_key_value_info(
            jsonSourceData
        )

        hierarchy = traverse_hierarchy(
            new_data.codeObjs,
            new_data.codeObjImpls,
            new_data.codeObjVariants,
            new_data.codeObjVariantMap,
            rootChildren,
            rootId,
            options=TraversalOptions(
                collect_all_visited=True,
                build_children_map=True,
                build_id_to_name_path=True,
                build_name_path_to_id=True,
                build_name_path_to_descendants=True,
            ),
        )

        return ProcessedJSONInfo(new_data, hierarchy)

    def construct_json_source_key_value_info(self, jsonSourceData):
        new_data = JSONSourceKeyValueInfo()
        rootChildren = self.construct_json_source_key_value_info_helper(
            new_data, jsonSourceData
        )
        rootImpl = NestedParamCodeObjImpl(children=rootChildren)
        rootVariant = Variant(
            impl=rootImpl.id, nonPresetImpls=compute_initial_nonPresetImpls(rootImpl)
        )
        root = Core(
            name="",
            variants=[rootVariant.id],
            defaultVariant=rootVariant.id,
            unsharedKeys=[],
        )
        new_data.codeObjVariantMap[root.id] = rootVariant.id
        new_data.codeObjImpls[rootImpl.id] = rootImpl
        new_data.codeObjVariants[rootVariant.id] = rootVariant
        new_data.codeObjs[root.id] = root
        return new_data, root.id, rootChildren

    def construct_json_source_key_value_info_helper(
        self, output: JSONSourceKeyValueInfo, obj: dict
    ):
        children_keys: list[str] = []
        for k, v in obj.items():
            codeObj, codeObjImpl, codeObjVariant = self.add_to_processed_json_object(
                k, v, output
            )
            children_keys.append(codeObj.id)
            if isinstance(codeObjImpl, NestedParamCodeObjImpl):
                set_effective_impl_value(
                    codeObjImpl,
                    codeObj,
                    codeObjVariant,
                    NestedParamCodeObjImplArgsWithCallable(
                        children=self.construct_json_source_key_value_info_helper(
                            output, v
                        )
                    ),
                )

        return children_keys

    def add_to_processed_json_object(
        self, key: str, value, output: JSONSourceKeyValueInfo
    ):
        is_dict = isinstance(value, dict)
        if is_dict:
            codeObjImpl = create_code_obj_impl(
                CodeObjType.NestedParam,
                self.settings_file.settings.nestedParamCodeObjDefault,
            )
            codeObjVariant = Variant(
                impl=codeObjImpl.id,
                nonPresetImpls=compute_initial_nonPresetImpls(codeObjImpl),
            )
        else:
            codeObjImpl = create_code_obj_impl(
                CodeObjType.TextParam,
                self.settings_file.settings.textParamCodeObjDefault,
            )
            codeObjVariant = Variant(
                impl=codeObjImpl.id,
                nonPresetImpls=compute_initial_nonPresetImpls(codeObjImpl),
            )
        variantId = codeObjVariant.id
        codeObj = Core(
            name=key,
            variants=[variantId],
            defaultVariant=variantId,
            unsharedKeys=[],  # all attributes (like value) should be shared across variants & impls
        )

        if isinstance(codeObjImpl, TextParamCodeObjImpl):
            # this should set codeObj.sharedModifier["value"]
            set_effective_impl_value(
                codeObjImpl,
                codeObj,
                codeObjVariant,
                TextParamCodeObjImplArgsWithCallable(value=json.dumps(value)),
            )

        output.codeObjVariantMap[codeObj.id] = variantId
        output.codeObjs[codeObj.id] = codeObj
        output.codeObjImpls[codeObjImpl.id] = codeObjImpl
        output.codeObjVariants[variantId] = codeObjVariant
        return codeObj, codeObjImpl, codeObjVariant
