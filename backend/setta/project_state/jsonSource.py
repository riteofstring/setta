import asyncio
import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine


from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.code_obj_impls import CodeObjType, NestedParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.impl_args_as_typed_dicts import DictSectionImplArgs
from setta.types.generated.impl_creation_fns import (
    create_code_obj_impl,
    create_section_impl,
)
from setta.types.generated.unions import BaseCodeObjImplUnion
from setta.types.helpers_lvl1 import get_variant_base_and_effective_section_impl
from setta.types.hierarchy_traversal import (
    HierarchyTraversalResult,
    TraversalOptions,
    traverse_hierarchy,
)
from setta.types.notifications import SettaNotification
from setta.types.section_impls import BaseDictSectionImpl, SectionType

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.database.settings_file import SettingsFile
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.types.project_state import ProjectStateCore
    from setta.types.specific_file_watcher import FileWatcherCoreUpdate
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


@dataclass
class ProcessedJSONObject:
    sectionImpl: BaseDictSectionImpl
    codeObjs: dict[str, Core] = field(default_factory=dict)
    codeObjImpls: dict[str, BaseCodeObjImplUnion] = field(default_factory=dict)
    codeObjVariants: dict[str, Variant] = field(default_factory=dict)


MetadataTuple = tuple[Path, tuple[str, ...]]
MetadataTupleToId = dict[MetadataTuple, str]


@dataclass
class ProcessedJSONInfo:
    processedJson: ProcessedJSONObject
    hierarchy: HierarchyTraversalResult
    metadataTupleToId: MetadataTupleToId


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
        self.json_source_to_variant_mapping: dict[Path, set[str]] = defaultdict(set)

    def watch_json_source_files(
        self,
        callbackCategory: str,
        load_json_sources_fn: Callable[
            [dict[Path, ProcessedJSONInfo], set[str]], Coroutine[Any, Any, None]
        ],
        project_state_backend_getter_fn: Callable[[], "ProjectStateCore"],
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
            [dict[Path, ProcessedJSONInfo], set[str]], Coroutine[Any, Any, None]
        ],
        project_state_backend_getter_fn: Callable[[], "ProjectStateCore"],
    ) -> FileWatcherCallback:
        async def fn(coreUpdate: "FileWatcherCoreUpdate"):
            filepath = coreUpdate.fileToRead
            file_content = self.dbe.read_json(filepath)
            processedJsonInfo = self.process_json_object(filepath, file_content)
            self.json_sources[filepath] = processedJsonInfo
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

    def get_json_source_files_to_watch(self, p: "ProjectStateCore"):
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

    def process_json_object(
        self,
        filepath: Path,
        jsonSourceData: dict,
    ):
        new_data = ProcessedJSONObject(
            sectionImpl=create_section_impl(
                SectionType.Dict,
                self.settings_file.settings.dictSectionDefault,
                DictSectionImplArgs(isJsonSource=True),
            )
        )

        topLevelParamIds = self.process_json_object_helper(new_data, jsonSourceData)
        new_data.sectionImpl.topLevelParamIds = topLevelParamIds

        hierarchy = traverse_hierarchy(
            new_data.codeObjs,
            new_data.codeObjImpls,
            new_data.codeObjVariants,
            new_data.sectionImpl.codeObjVariantMap,
            new_data.sectionImpl.topLevelParamIds,
            options=TraversalOptions(
                collect_all_visited=True,
                build_name_paths=True,
            ),
        )
        metadataTupleToId = createMetadataTupleToId(filepath, hierarchy)

        return ProcessedJSONInfo(new_data, hierarchy, metadataTupleToId)

    def process_json_object_helper(self, output: ProcessedJSONObject, obj: dict):
        children_keys: list[str] = []
        for k, v in obj.items():
            codeObj, codeObjImpl = self.add_to_processed_json_object(k, v, output)
            children_keys.append(codeObj.id)
            if isinstance(codeObjImpl, NestedParamCodeObjImpl):
                codeObjImpl.children = self.process_json_object_helper(output, v)

        return children_keys

    def add_to_processed_json_object(
        self, key: str, value, output: ProcessedJSONObject
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
                {"value": json.dumps(value)},
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
        )

        output.sectionImpl.codeObjVariantMap[codeObj.id] = variantId
        output.codeObjs[codeObj.id] = codeObj
        output.codeObjImpls[codeObjImpl.id] = codeObjImpl
        output.codeObjVariants[variantId] = codeObjVariant
        return codeObj, codeObjImpl


def createMetadataTuple(filename: Path, path: list[str]):
    return filename, tuple(path)


def createMetadataTupleToId(filename: Path, hierarchy: HierarchyTraversalResult):
    output: MetadataTupleToId = {}
    for id in hierarchy.name_path_map:
        output[createMetadataTuple(filename, hierarchy.name_path_map[id])] = id
    return output
