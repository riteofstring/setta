import logging
from dataclasses import dataclass
from pathlib import Path
from pprint import pprint
from typing import Iterable

from setta.project_state.jsonSource import (
    ProcessedJSONInfo,
)
from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    NestedParamCodeObjImpl,
)
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import (
    get_effective_impl,
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseChildlessCodeObjImplArgsWithCallable,
    BaseDictSectionImplArgsWithCallable,
    NestedParamCodeObjImplArgsWithCallable,
)
from setta.types.generated.unions import (
    BaseCodeObjImplUnionWithDiscriminator,
    BaseDictSectionImplUnionWithDiscriminator,
)
from setta.types.helpers_lvl1 import (
    get_variant_base_and_effective_code_obj_impl,
    get_variant_base_and_effective_section_impl,
)
from setta.types.hierarchy_traversal import (
    HierarchyTraversalResult,
    TraversalOptions,
    traverse_hierarchy,
)
from setta.types.project_state import (
    ProjectStateCore,
)
from setta.types.section_impls import BaseDictSectionImpl

logger = logging.getLogger(__name__)


@dataclass
class NewCodeObjInfo:
    codeObj: Core
    codeObjImpl: BaseCodeObjImplUnionWithDiscriminator
    codeObjVariant: Variant


@dataclass
class ReplacementInfo:
    existingCodeObjId: str
    newImpl: BaseCodeObjImplUnionWithDiscriminator


@dataclass
class SectionVariantToUpdate:
    section: Core
    baseImpl: BaseDictSectionImplUnionWithDiscriminator
    impl: BaseDictSectionImplUnionWithDiscriminator
    variant: Variant
    hierarchy: HierarchyTraversalResult
    processedJson: ProcessedJSONInfo


def load_json_sources_into_data_structures(
    p: ProjectStateCore,
    json_sources: dict[Path, ProcessedJSONInfo],
    section_variant_ids: Iterable[str] | None = None,
):
    processedVariantIds: set[str] = set()
    replacements: dict[str, ReplacementInfo] = {}
    newCodeObjInfo: dict[str, NewCodeObjInfo] = {}
    sectionVariantsToUpdate: dict[str, SectionVariantToUpdate] = {}

    for section in p.sections.values():
        for variant_id in section.variants:
            if variant_id in processedVariantIds:
                continue
            processedVariantIds.add(variant_id)
            variant, base_impl, impl = get_variant_base_and_effective_section_impl(
                p, section, variant_id
            )
            if (
                not isinstance(base_impl, BaseDictSectionImpl)
                or not isinstance(impl, BaseDictSectionImpl)
                or not impl.isJsonSource
                or (section_variant_ids and variant_id not in section_variant_ids)
            ):
                continue
            filename = Path(variant.name).resolve()
            processedJson = json_sources.get(filename)
            isMissing = processedJson is None
            impl = set_effective_impl_value(
                base_impl,
                section,
                variant,
                BaseDictSectionImplArgsWithCallable(jsonSourceMissing=isMissing),
            )
            if isMissing:
                continue
            hierarchy = compute_existing_replacement_mapping(
                p, processedJson, impl, replacements, newCodeObjInfo
            )
            sectionVariantsToUpdate[variant_id] = SectionVariantToUpdate(
                section, base_impl, impl, variant, hierarchy, processedJson
            )

    filter_out_replacements_from_new(replacements, newCodeObjInfo)
    newCodeObjVariantMapEntries = add_new_to_state(p, newCodeObjInfo)
    print("********replacements********")
    pprint(replacements)
    print("********newCodeObjInfo********")
    pprint(newCodeObjInfo)
    for toUpdate in sectionVariantsToUpdate.values():
        merge_into_existing(p, toUpdate, replacements, newCodeObjVariantMapEntries)


def merge_into_existing(
    p: ProjectStateCore,
    to_update: SectionVariantToUpdate,
    replacements: dict[str, ReplacementInfo],
    newCodeObjVariantMapEntries: dict[str, str],
):
    for newId, r in replacements.items():
        variantId = to_update.impl.codeObjVariantMap[r.existingCodeObjId]
        codeObjCore = p.codeObjs[r.existingCodeObjId]
        variant, baseCodeObjImpl, impl = get_variant_base_and_effective_code_obj_impl(
            p, codeObjCore, variantId
        )
        if (
            isinstance(baseCodeObjImpl, NestedParamCodeObjImpl)
            and isinstance(impl, NestedParamCodeObjImpl)
            and isinstance(r.newImpl, NestedParamCodeObjImpl)
        ):
            impl = set_effective_impl_value(
                baseCodeObjImpl,
                codeObjCore,
                variant,
                NestedParamCodeObjImplArgsWithCallable(
                    children=[
                        replacements[c].existingCodeObjId if c in replacements else c
                        for c in r.newImpl.children
                    ]
                ),
            )
        elif (
            isinstance(baseCodeObjImpl, BaseChildlessCodeObjImpl)
            and isinstance(impl, BaseChildlessCodeObjImpl)
            and isinstance(r.newImpl, BaseChildlessCodeObjImpl)
        ):
            impl = set_effective_impl_value(
                baseCodeObjImpl,
                codeObjCore,
                variant,
                BaseChildlessCodeObjImplArgsWithCallable(value=r.newImpl.value),
            )
        else:
            raise TypeError

    to_delete_from_code_obj_variant_map: set[str] = set()
    for name_path, id in to_update.hierarchy.name_path_to_id.items():
        newId = to_update.processedJson.hierarchy.name_path_to_id.get(name_path)
        if not newId:
            variantId = to_update.impl.codeObjVariantMap[id]
            variant = p.codeObjVariants[variantId]
            impl = p.codeObjImpls[variant.impl]
            to_delete_from_code_obj_variant_map.add(id)
            del p.codeObjs[id]
            del p.codeObjImpls[impl.id]
            del p.codeObjVariants[variantId]

    newTopLevelParamIds = to_update.processedJson.jsonSourceKeyToTopLevelIds[
        tuple(to_update.impl.jsonSourceKeys)
    ]
    set_effective_impl_value(
        to_update.baseImpl,
        to_update.section,
        to_update.variant,
        BaseDictSectionImplArgsWithCallable(
            topLevelParamIds=[
                replacements[c].existingCodeObjId if c in replacements else c
                for c in newTopLevelParamIds
            ],
            codeObjVariantMap=lambda curr: newCodeObjVariantMapEntries
            | {
                k: v
                for k, v in curr.items()
                if k not in to_delete_from_code_obj_variant_map
            },
        ),
    )


def compute_existing_replacement_mapping(
    p: ProjectStateCore,
    processedJson: ProcessedJSONInfo,
    section_impl: BaseDictSectionImpl,
    replacements: dict[str, ReplacementInfo],
    newCodeObjInfo: dict[str, NewCodeObjInfo],
):
    keyValueInfo = processedJson.keyValueInfo
    newIdsToProcess = processedJson.hierarchy.name_path_to_descendant_ids.get(
        tuple(section_impl.jsonSourceKeys), set()
    )
    newIdsToProcess = newIdsToProcess.difference(replacements.keys())

    hierarchy = traverse_hierarchy(
        p.codeObjs,
        p.codeObjImpls,
        p.codeObjVariants,
        section_impl.codeObjVariantMap,
        section_impl.topLevelParamIds,
        TraversalOptions(
            collect_all_visited=True,
            build_id_to_name_path=True,
            build_name_path_to_id=True,
            name_path_prefix=tuple(section_impl.jsonSourceKeys),
        ),
    )

    for newId in newIdsToProcess:
        existingCodeObjId = hierarchy.name_path_to_id.get(
            processedJson.hierarchy.id_to_name_path[newId]
        )
        newCodeObj = keyValueInfo.codeObjs[newId]
        newVariantId = keyValueInfo.codeObjVariantMap[newId]
        newVariant = keyValueInfo.codeObjVariants[newVariantId]
        newImpl = keyValueInfo.codeObjImpls[newVariant.impl]
        if newId not in newCodeObjInfo:
            newCodeObjInfo[newId] = NewCodeObjInfo(newCodeObj, newImpl, newVariant)
        if existingCodeObjId:
            newEffectiveImpl = get_effective_impl(newImpl, newCodeObj, newVariant)
            replacements[newId] = ReplacementInfo(existingCodeObjId, newEffectiveImpl)

    return hierarchy


def filter_out_replacements_from_new(
    replacements: dict[str, ReplacementInfo], newCodeObjInfo: dict[str, NewCodeObjInfo]
):
    for r in replacements.keys():
        newCodeObjInfo.pop(r, None)


def add_new_to_state(
    p: ProjectStateCore,
    newCodeObjInfo: dict[str, NewCodeObjInfo],
):
    newCodeObjVariantMapEntries: dict[str, str] = {}
    for id, n in newCodeObjInfo.items():
        newCodeObjVariantMapEntries[id] = n.codeObjVariant.id
        p.codeObjVariants[n.codeObjVariant.id] = n.codeObjVariant
        p.codeObjImpls[n.codeObjImpl.id] = n.codeObjImpl
        p.codeObjs[id] = n.codeObj

    return newCodeObjVariantMapEntries
