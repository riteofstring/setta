import json
import logging
from pathlib import Path
from typing import Iterable

from pydantic import BaseModel, Field

from setta.types.code_obj_impls import (
    BaseCodeObjImpl,
    CodeObjType,
    NestedParamCodeObjImpl,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.effective_impls import (
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseChildlessCodeObjImplArgsWithCallable,
    BaseDictSectionImplArgsWithCallable,
    DictSectionImplArgs,
    NestedParamCodeObjImplArgsWithCallable,
)
from setta.types.generated.impl_creation_fns import (
    create_code_obj_impl,
    create_section_impl,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import (
    BaseChildlessCodeObjImplUnion,
    BaseCodeObjImplUnion,
    BaseDictSectionImplUnion,
)
from setta.types.helpers_lvl1 import (
    get_variant_base_and_effective_code_obj_impl,
    get_variant_base_and_effective_section_impl,
)
from setta.types.helpers_lvl2 import (
    get_code_obj_variant_map_update_fn,
)
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_state import (
    ProjectStateCore,
)
from setta.types.section_impls import (
    BaseDictSectionImpl,
    SectionType,
)

logger = logging.getLogger(__name__)


class ProcessedJSONObject(BaseModel):
    sectionImpl: BaseDictSectionImpl
    codeObjs: dict[str, Core] = Field(default_factory=dict)
    codeObjImpls: dict[str, BaseCodeObjImplUnion] = Field(default_factory=dict)
    codeObjVariants: dict[str, Variant] = Field(default_factory=dict)


def load_json_sources_into_data_structures(
    settings: SettingsState,
    p: ProjectStateCore,
    json_sources: dict[Path, dict],
    section_variant_ids: Iterable[str] | None = None,
):
    processed = set()
    for section in p.sections.values():
        for variant_id in section.variants:
            if variant_id in processed:
                continue
            processed.add(variant_id)
            variant, base_impl, impl = get_variant_base_and_effective_section_impl(
                p, section, variant_id
            )
            if (
                not isinstance(base_impl, BaseDictSectionImplUnion)
                or not isinstance(impl, BaseDictSectionImplUnion)
                or not impl.isJsonSource
                or (section_variant_ids and variant_id not in section_variant_ids)
            ):
                continue
            print("variant_id", variant_id)
            jsonSourceData = json_sources.get(Path(variant.name).resolve())
            new_data = process_json_object(
                settings, jsonSourceData, impl.jsonSourceKeys
            )
            isMissing = new_data is None
            impl = set_effective_impl_value(
                base_impl,
                section,
                variant,
                BaseDictSectionImplArgsWithCallable(jsonSourceMissing=isMissing),
            )
            if isMissing:
                continue
            merge_into_existing(
                p,
                variant.name,
                new_data,
                section,
                base_impl,
                impl,
                variant,
            )


def merge_into_existing(
    p: ProjectStateCore,
    filename: str,
    new_data: ProcessedJSONObject,
    section: Core,
    base_section_impl: BaseDictSectionImplUnion,
    section_impl: BaseDictSectionImplUnion,
    section_variant: Variant,
):
    hierarchy = traverse_hierarchy(
        p.codeObjs,
        p.codeObjImpls,
        p.codeObjVariants,
        section_impl.codeObjVariantMap,
        section_impl.topLevelParamIds,
        TraversalOptions(
            collect_all_visited=True,
            build_name_paths=True,
        ),
    )
    jsonSourceMetadata_to_id: dict[str, str] = {}
    for id in hierarchy.name_path_map:
        jsonSourceMetadata_to_id[
            createMetadataJsonString(filename, hierarchy.name_path_map[id])
        ] = id

    new_hierarchy = traverse_hierarchy(
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
    new_jsonSourceMetadata_to_id: dict[str, str] = {}
    for id in new_hierarchy.name_path_map:
        new_jsonSourceMetadata_to_id[
            createMetadataJsonString(filename, new_hierarchy.name_path_map[id])
        ] = id

    replacements: dict[str, tuple[str, BaseCodeObjImpl]] = {}
    for newId, newCodeObj in new_data.codeObjs.items():
        existingCodeObjId = jsonSourceMetadata_to_id.get(
            createMetadataJsonString(filename, new_hierarchy.name_path_map[newId])
        )
        newVariantId = new_data.sectionImpl.codeObjVariantMap[newId]
        newVariant = new_data.codeObjVariants[newVariantId]
        newImpl = new_data.codeObjImpls[newVariant.impl]
        if not existingCodeObjId:
            section_impl = set_effective_impl_value(
                base_section_impl,
                section,
                section_variant,
                BaseDictSectionImplArgsWithCallable(
                    codeObjVariantMap=get_code_obj_variant_map_update_fn(
                        {newId: newVariantId}
                    )
                ),
            )
            p.codeObjVariants[newVariantId] = newVariant
            p.codeObjImpls[newImpl.id] = newImpl
            p.codeObjs[newId] = newCodeObj
        else:
            replacements[newId] = (existingCodeObjId, newImpl)

    for newId, (existingCodeObjId, newImpl) in replacements.items():
        variantId = section_impl.codeObjVariantMap[existingCodeObjId]
        codeObjCore = p.codeObjs[existingCodeObjId]
        variant, baseCodeObjImpl, impl = get_variant_base_and_effective_code_obj_impl(
            p, codeObjCore, variantId
        )
        if (
            isinstance(baseCodeObjImpl, NestedParamCodeObjImpl)
            and isinstance(impl, NestedParamCodeObjImpl)
            and isinstance(newImpl, NestedParamCodeObjImpl)
        ):
            impl = set_effective_impl_value(
                baseCodeObjImpl,
                codeObjCore,
                variant,
                NestedParamCodeObjImplArgsWithCallable(
                    children=[
                        replacements[c][0] if c in replacements else c
                        for c in newImpl.children
                    ]
                ),
            )
        elif (
            isinstance(baseCodeObjImpl, BaseChildlessCodeObjImplUnion)
            and isinstance(impl, BaseChildlessCodeObjImplUnion)
            and isinstance(newImpl, BaseChildlessCodeObjImplUnion)
        ):
            impl = set_effective_impl_value(
                baseCodeObjImpl,
                codeObjCore,
                variant,
                BaseChildlessCodeObjImplArgsWithCallable(value=newImpl.value),
            )
        else:
            raise TypeError

    to_delete_from_code_obj_variant_map: set[str] = set()
    for metadataString, id in jsonSourceMetadata_to_id.items():
        newId = new_jsonSourceMetadata_to_id.get(metadataString)
        if not newId:
            variantId = section_impl.codeObjVariantMap[id]
            variant = p.codeObjVariants[variantId]
            impl = p.codeObjImpls[variant.impl]
            to_delete_from_code_obj_variant_map.add(id)
            del p.codeObjs[id]
            del p.codeObjImpls[impl.id]
            del p.codeObjVariants[variantId]

    set_effective_impl_value(
        base_section_impl,
        section,
        section_variant,
        BaseDictSectionImplArgsWithCallable(
            topLevelParamIds=[
                replacements[c][0] if c in replacements else c
                for c in new_data.sectionImpl.topLevelParamIds
            ],
            codeObjVariantMap=lambda curr: {
                k: v
                for k, v in curr.items()
                if k not in to_delete_from_code_obj_variant_map
            },
        ),
    )


def process_json_object(
    settings: SettingsState,
    jsonSourceData: dict | None,
    jsonSourceKeys: list[str],
):
    if jsonSourceData is None:
        return None

    new_data = ProcessedJSONObject(
        sectionImpl=create_section_impl(
            SectionType.Dict,
            settings.dictSectionDefault,
            DictSectionImplArgs(isJsonSource=True, jsonSourceKeys=jsonSourceKeys),
        )
    )

    try:
        for k in jsonSourceKeys:
            jsonSourceData = jsonSourceData[k]
    except:
        # TODO print warning or something
        pass

    topLevelParamIds = process_json_object_helper(settings, new_data, jsonSourceData)
    new_data.sectionImpl.topLevelParamIds = topLevelParamIds

    return new_data


def process_json_object_helper(
    settings: SettingsState, output: ProcessedJSONObject, obj: dict
):
    children_keys: list[str] = []
    for k, v in obj.items():
        codeObj, codeObjImpl = add_to_processed_json_object(settings, k, v, output)
        children_keys.append(codeObj.id)
        if isinstance(codeObjImpl, NestedParamCodeObjImpl):
            codeObjImpl.children = process_json_object_helper(settings, output, v)

    return children_keys


def add_to_processed_json_object(
    settings: SettingsState, key: str, value, output: ProcessedJSONObject
):
    is_dict = isinstance(value, dict)
    if is_dict:
        codeObjImpl = create_code_obj_impl(
            CodeObjType.NestedParam, settings.nestedParamCodeObjDefault
        )
        codeObjVariant = Variant(
            impl=codeObjImpl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(codeObjImpl),
        )
    else:
        codeObjImpl = create_code_obj_impl(
            CodeObjType.TextParam,
            settings.textParamCodeObjDefault,
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


def createMetadataJsonString(filename: str, path: list[str]):
    return json.dumps({"filename": filename, "key": path})
