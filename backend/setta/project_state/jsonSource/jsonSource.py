import asyncio
import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.code_obj_impls import (
    CodeObjType,
    NestedParamCodeObjImpl,
    TextParamCodeObjImpl,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.effective_impls import (
    get_effective_impl,
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
        self.json_sources: dict[Path, ProcessedJSONInfo] = {}
        # maps from file path to set of (sectionId, variantId)
        self.json_source_to_section_variant: dict[Path, set[tuple[str, str]]] = (
            defaultdict(set)
        )

    def _summarize_processed_json(
        self, processed_json: ProcessedJSONInfo
    ) -> tuple[Any, list[str] | None]:
        hierarchy = processed_json.hierarchy
        top_level_keys: list[str] | None = None
        if hierarchy.name_path_to_id:
            top_level_keys = sorted({path[0] for path in hierarchy.name_path_to_id if len(path) > 0})
        grid_pattern_value = None
        grid_path = ("gui", "gridPattern")
        grid_obj_id = hierarchy.name_path_to_id.get(grid_path)
        if grid_obj_id:
            variant_id = processed_json.keyValueInfo.codeObjVariantMap.get(grid_obj_id)
            if variant_id:
                variant = processed_json.keyValueInfo.codeObjVariants.get(variant_id)
                code_obj = processed_json.keyValueInfo.codeObjs.get(grid_obj_id)
                if variant and code_obj:
                    base_impl = processed_json.keyValueInfo.codeObjImpls.get(variant.impl)
                    if base_impl:
                        effective_impl = get_effective_impl(base_impl, code_obj, variant)
                        if isinstance(effective_impl, TextParamCodeObjImpl):
                            try:
                                grid_pattern_value = json.loads(effective_impl.value)
                            except json.JSONDecodeError:
                                grid_pattern_value = effective_impl.value
        return grid_pattern_value, top_level_keys

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
            if filename in self.json_sources:
                section_variant_ids_to_load.update(
                    ids.difference(self.json_source_to_section_variant[filename])
                )

        if section_variant_ids_to_load and logger.isEnabledFor(logging.DEBUG):
            for filename, ids in new_json_source_to_section_variant.items():
                if filename not in self.json_sources:
                    continue
                relevant_variants = ids.intersection(section_variant_ids_to_load)
                if not relevant_variants:
                    continue
                processed_json = self.json_sources[filename]
                grid_pattern_value, top_level_keys = self._summarize_processed_json(
                    processed_json
                )
                logger.debug(
                    "jsonSource cache snapshot file=%s cacheId=%s gridPattern=%r topLevelKeys=%s sectionVariants=%s",
                    filename,
                    hex(id(processed_json)),
                    grid_pattern_value,
                    top_level_keys,
                    sorted(relevant_variants),
                )

        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "jsonSource watchers refresh category=%s files=%s newVariantCount=%d",
                callbackCategory,
                sorted(str(f) for f in filename_set),
                len(section_variant_ids_to_load),
            )

        if len(section_variant_ids_to_load) > 0:
            logger.debug(
                "jsonSource initial load scheduling for %d section variants",
                len(section_variant_ids_to_load),
            )
            asyncio.create_task(
                load_json_sources_fn(self.json_sources, section_variant_ids_to_load)
            )

        self.json_source_to_section_variant = new_json_source_to_section_variant

        callback = self.get_json_source_file_watcher_callback(
            load_json_sources_fn, project_state_backend_getter_fn
        )
        callbacks = {k: callback for k in filename_set}

        fire_immediately = set([f for f in filename_set if f not in self.json_sources])
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
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(
                    "jsonSource callback event=%s relPath=%s sectionVariantCount=%d",
                    getattr(coreUpdate.eventType, "value", coreUpdate.eventType),
                    getattr(coreUpdate, "relPath", filepath),
                    len(sectionVariantsToLoad),
                )
            file_content = self.dbe.read_json(filepath)

            if logger.isEnabledFor(logging.DEBUG):
                processedJsonInfo = self.process_json_object(file_content)
                grid_pattern_value, top_level_keys = self._summarize_processed_json(
                    processedJsonInfo
                )
                code_obj_count = len(processedJsonInfo.keyValueInfo.codeObjs)
                variant_count = len(processedJsonInfo.keyValueInfo.codeObjVariants)
                logger.debug(
                    "jsonSource cache update file=%s cacheId=%s codeObjCount=%d variantCount=%d gridPattern=%r topLevelKeys=%s",
                    filepath,
                    hex(id(processedJsonInfo)),
                    code_obj_count,
                    variant_count,
                    grid_pattern_value,
                    top_level_keys,
                )
            else:
                processedJsonInfo = self.process_json_object(file_content)
            self.json_sources[filepath] = processedJsonInfo

            if len(sectionVariantsToLoad) > 0:
                logger.debug(
                    "jsonSource triggering reload for %d section variants",
                    len(sectionVariantsToLoad),
                )
                await load_json_sources_fn(self.json_sources, sectionVariantsToLoad)
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
