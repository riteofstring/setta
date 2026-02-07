import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Coroutine, Iterable

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.logging.tasks import spawn_background_task
from setta.types.code_obj_impls import (
    CodeObjType,
    CodeParamCodeObjImpl,
    NestedParamCodeObjImpl,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.effective_impls import (
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    CodeParamCodeObjImplArgsWithCallable,
    NestedParamCodeObjImplArgsWithCallable,
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
from setta.types.id import ID
from setta.types.section_impls import BaseDictSectionImpl
from setta.utils.structured_data import read_json_source_payload
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
    codeObjs: dict[ID, Core] = field(default_factory=dict)
    codeObjImpls: dict[ID, BaseCodeObjImplUnionWithDiscriminator] = field(
        default_factory=dict
    )
    codeObjVariants: dict[ID, Variant] = field(default_factory=dict)
    codeObjVariantMap: dict[ID, ID] = field(default_factory=dict)


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
        # maps callback category -> file path -> set of (sectionId, variantId)
        self._category_to_section_variants: dict[
            str, dict[Path, set[tuple[ID, ID]]]
        ] = {}

    def _get_category_section_variants(
        self, callbackCategory: str
    ) -> dict[Path, set[tuple[ID, ID]]]:
        return self._category_to_section_variants.get(callbackCategory, {})

    def _set_category_section_variants(
        self,
        callbackCategory: str,
        mapping: dict[Path, set[tuple[ID, ID]]],
    ) -> None:
        self._category_to_section_variants[callbackCategory] = mapping

    def watch_json_source_files(
        self,
        callbackCategory: str,
        load_json_sources_fn: Callable[
            [dict[Path, ProcessedJSONInfo], set[tuple[ID, ID]]],
            Coroutine[Any, Any, None],
        ],
        project_state_backend_getter_fn: Callable[[], "ProjectStateCore"],
        *,
        should_defer_reload: Callable[..., bool] | None = None,
        on_deferred: Callable[[set[tuple[ID, ID]]], None] | None = None,
    ):
        filename_set, new_json_source_to_section_variant = (
            self.get_json_source_files_to_watch(project_state_backend_getter_fn())
        )
        previous_category_map = self._get_category_section_variants(callbackCategory)

        section_variant_ids_to_load: set[tuple[ID, ID]] = set()
        for filename, ids in new_json_source_to_section_variant.items():
            if filename in self.json_sources:
                section_variant_ids_to_load.update(
                    ids.difference(previous_category_map.get(filename, set()))
                )

        if len(section_variant_ids_to_load) > 0:
            section_variants_snapshot = set(section_variant_ids_to_load)
            should_defer = False
            if should_defer_reload is not None:
                should_defer = should_defer_reload(
                    section_variants_snapshot,
                    new_mapping=new_json_source_to_section_variant,
                    previous_mapping=previous_category_map,
                )
            if should_defer:
                if on_deferred:
                    on_deferred(section_variants_snapshot)
            else:
                spawn_background_task(
                    load_json_sources_fn(self.json_sources, section_variants_snapshot),
                    label="json-source-load",
                    extra_values={
                        "callback_category": callbackCategory,
                        "section_variants_count": len(section_variants_snapshot),
                    },
                )

        normalized_mapping = {
            filename: set(ids)
            for filename, ids in new_json_source_to_section_variant.items()
        }
        self._set_category_section_variants(callbackCategory, normalized_mapping)

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
            [dict[Path, ProcessedJSONInfo], set[tuple[ID, ID]]],
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
            if not filepath.exists():
                if filepath in self.json_sources:
                    del self.json_sources[filepath]
                if len(sectionVariantsToLoad) > 0:
                    await load_json_sources_fn(self.json_sources, sectionVariantsToLoad)
                return
            file_content = read_json_source_payload(filepath, self.dbe)
            processedJsonInfo = self.process_json_object(file_content)
            self.json_sources[filepath] = processedJsonInfo

            if len(sectionVariantsToLoad) > 0:
                await load_json_sources_fn(self.json_sources, sectionVariantsToLoad)
                logger.debug(
                    "JSON source update: %s %s",
                    coreUpdate.relPath,
                    coreUpdate.eventType.value,
                )

        return fn

    def get_json_source_files_to_watch(self, p: "ProjectStateCore"):
        filename_set: set[Path] = set()
        new_json_source_to_variant_mapping: dict[Path, set[tuple[ID, ID]]] = (
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

    def process_json_source_files(
        self, paths: Iterable[Path]
    ) -> dict[Path, ProcessedJSONInfo]:
        json_sources: dict[Path, ProcessedJSONInfo] = {}
        for path in paths:
            normalized = normalize_path(path)
            if not normalized.exists():
                continue
            payload = read_json_source_payload(normalized, self.dbe)
            json_sources[normalized] = self.process_json_object(payload)
        return json_sources

    def get_section_variants_for_json_source_update(
        self, p: "ProjectStateCore", coreUpdate: "FileWatcherCoreUpdate"
    ):
        sectionVariantsToLoad: set[tuple[ID, ID]] = set()
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
        children_keys: list[ID] = []
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
                CodeObjType.CodeParam,
                self.settings_file.settings.codeParamCodeObjDefault,
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

        if isinstance(codeObjImpl, CodeParamCodeObjImpl):
            # this should set codeObj.sharedModifier["value"]
            set_effective_impl_value(
                codeObjImpl,
                codeObj,
                codeObjVariant,
                CodeParamCodeObjImplArgsWithCallable(value=json.dumps(value)),
            )

        output.codeObjVariantMap[codeObj.id] = variantId
        output.codeObjs[codeObj.id] = codeObj
        output.codeObjImpls[codeObjImpl.id] = codeObjImpl
        output.codeObjVariants[variantId] = codeObjVariant
        return codeObj, codeObjImpl, codeObjVariant
