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
from setta.types.helpers_lvl2 import create_new_code_obj_variant, delete_code_obj
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
class ReplacementInfo:
    existingCodeObjId: str
    matchedImpl: BaseCodeObjImplUnionWithDiscriminator


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
    unmatchedCodeObj: dict[str, Core] = {}
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
                p, processedJson, impl, replacements, unmatchedCodeObj
            )
            sectionVariantsToUpdate[variant_id] = SectionVariantToUpdate(
                section, base_impl, impl, variant, hierarchy, processedJson
            )

    filter_out_replacements_from_unmatched(replacements, unmatchedCodeObj)
    print("********replacements********")
    pprint(replacements)
    print("********unmatchedCodeObj********")
    pprint(unmatchedCodeObj)
    for toUpdate in sectionVariantsToUpdate.values():
        merge_into_existing(p, toUpdate, replacements, unmatchedCodeObj)


def merge_into_existing(
    p: ProjectStateCore,
    to_update: SectionVariantToUpdate,
    replacements: dict[str, ReplacementInfo],
    unmatchedCodeObj: dict[str, Core],
):
    newCodeObjVariantMapEntries: dict[str, str] = {}
    for matchedId, r in replacements.items():
        codeObjCore = p.codeObjs[r.existingCodeObjId]
        variantId = to_update.impl.codeObjVariantMap.get(r.existingCodeObjId)
        if not variantId:
            variantId = create_new_code_obj_variant(p, codeObjCore.id, None)
            newCodeObjVariantMapEntries[r.existingCodeObjId] = variantId
        variant, baseCodeObjImpl, impl = get_variant_base_and_effective_code_obj_impl(
            p, codeObjCore, variantId
        )
        if (
            isinstance(baseCodeObjImpl, NestedParamCodeObjImpl)
            and isinstance(impl, NestedParamCodeObjImpl)
            and isinstance(r.matchedImpl, NestedParamCodeObjImpl)
        ):
            impl = set_effective_impl_value(
                baseCodeObjImpl,
                codeObjCore,
                variant,
                NestedParamCodeObjImplArgsWithCallable(
                    children=[
                        replacements[c].existingCodeObjId if c in replacements else c
                        for c in r.matchedImpl.children
                    ]
                ),
            )
        elif (
            isinstance(baseCodeObjImpl, BaseChildlessCodeObjImpl)
            and isinstance(impl, BaseChildlessCodeObjImpl)
            and isinstance(r.matchedImpl, BaseChildlessCodeObjImpl)
        ):
            impl = set_effective_impl_value(
                baseCodeObjImpl,
                codeObjCore,
                variant,
                BaseChildlessCodeObjImplArgsWithCallable(value=r.matchedImpl.value),
            )
        else:
            raise TypeError

    for u in unmatchedCodeObj.values():
        if u.id not in p.codeObjs:
            u.variants = []
            u.defaultVariant = None
            p.codeObjs[u.id] = u
        variantId = create_new_code_obj_variant(p, u.id, None)
        if not u.defaultVariant:
            u.defaultVariant = variantId
        newCodeObjVariantMapEntries[u.id] = variantId

    to_delete_from_code_obj_variant_map: set[str] = set()
    for name_path, id in to_update.hierarchy.name_path_to_id.items():
        matchedId = to_update.processedJson.hierarchy.name_path_to_id.get(name_path)
        if not matchedId:
            delete_code_obj(p, id)
            to_delete_from_code_obj_variant_map.add(id)

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
    unmatchedCodeObj: dict[str, Core],
):
    keyValueInfo = processedJson.keyValueInfo
    idsToProcess = processedJson.hierarchy.name_path_to_descendant_ids.get(
        tuple(section_impl.jsonSourceKeys), set()
    )
    idsToProcess = idsToProcess.difference(replacements.keys())

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

    for id in idsToProcess:
        existingCodeObjId = hierarchy.name_path_to_id.get(
            processedJson.hierarchy.id_to_name_path[id]
        )
        codeObj = keyValueInfo.codeObjs[id]
        if id not in unmatchedCodeObj:
            unmatchedCodeObj[id] = codeObj
        if existingCodeObjId:
            variantId = keyValueInfo.codeObjVariantMap[id]
            variant = keyValueInfo.codeObjVariants[variantId]
            impl = keyValueInfo.codeObjImpls[variant.impl]
            effectiveImpl = get_effective_impl(impl, codeObj, variant)
            replacements[id] = ReplacementInfo(existingCodeObjId, effectiveImpl)

    return hierarchy


def filter_out_replacements_from_unmatched(
    replacements: dict[str, ReplacementInfo],
    unmatchedCodeObj: dict[str, Core],
):
    for r in replacements.keys():
        unmatchedCodeObj.pop(r, None)
