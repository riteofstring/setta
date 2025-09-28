import logging
from dataclasses import dataclass
from pathlib import Path
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
    get_variant_base_code_obj_impl,
)
from setta.types.helpers_lvl2 import create_new_code_obj_variant, delete_code_obj
from setta.types.hierarchy_traversal import (
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
class UnmatchedCodeObjInfo:
    codeObj: Core
    codeObjImpl: BaseCodeObjImplUnionWithDiscriminator


@dataclass
class SectionVariantToUpdate:
    section: Core
    baseImpl: BaseDictSectionImplUnionWithDiscriminator
    impl: BaseDictSectionImplUnionWithDiscriminator
    variant: Variant
    processedJson: ProcessedJSONInfo


def load_json_sources_into_data_structures(
    p: ProjectStateCore,
    json_sources: dict[Path, ProcessedJSONInfo],
    section_variant_ids: Iterable[str] | None = None,
):
    processedVariantIds: set[str] = set()
    replacements: dict[str, ReplacementInfo] = {}
    unmatchedCodeObj: dict[str, UnmatchedCodeObjInfo] = {}
    sectionVariantsToUpdate: dict[str, SectionVariantToUpdate] = {}
    codeObjsToDelete: set[str] = set()

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
            currCodeObjsToDelete = compute_existing_replacement_mapping(
                p, processedJson, impl, replacements, unmatchedCodeObj
            )
            if (not section_variant_ids) or (variant_id in section_variant_ids):
                sectionVariantsToUpdate[variant_id] = SectionVariantToUpdate(
                    section,
                    base_impl,
                    impl,
                    variant,
                    processedJson,
                )
                codeObjsToDelete.update(currCodeObjsToDelete)

    filter_out_replacements_from_unmatched(replacements, unmatchedCodeObj)
    delete_old_code_objs(p, codeObjsToDelete)
    for toUpdate in sectionVariantsToUpdate.values():
        merge_into_existing(
            p, toUpdate, replacements, unmatchedCodeObj, codeObjsToDelete
        )


def merge_into_existing(
    p: ProjectStateCore,
    to_update: SectionVariantToUpdate,
    replacements: dict[str, ReplacementInfo],
    unmatchedCodeObj: dict[str, UnmatchedCodeObjInfo],
    codeObjsToDelete: set[str],
):
    newCodeObjVariantMapEntries: dict[str, str] = {}
    for matchedId, r in replacements.items():
        codeObjCore = p.codeObjs[r.existingCodeObjId]
        variantId = to_update.impl.codeObjVariantMap.get(r.existingCodeObjId)
        if not variantId:
            # IMMEDIATE TODO:
            # Also, topLevelParamId should point to a nested param that contains the displayed params
            variantId = create_new_code_obj_variant(
                p, codeObjCore.id, None, r.matchedImpl
            )
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
        if u.codeObj.id not in p.codeObjs:
            u.codeObj.variants = []
            u.codeObj.defaultVariant = None
            p.codeObjs[u.codeObj.id] = u.codeObj
        variantId = create_new_code_obj_variant(p, u.codeObj.id, None, u.codeObjImpl)
        if not u.codeObj.defaultVariant:
            u.codeObj.defaultVariant = variantId
        newCodeObjVariantMapEntries[u.codeObj.id] = variantId

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
            | {k: v for k, v in curr.items() if k not in codeObjsToDelete},
        ),
    )


def compute_existing_replacement_mapping(
    p: ProjectStateCore,
    processedJson: ProcessedJSONInfo,
    section_impl: BaseDictSectionImpl,
    replacements: dict[str, ReplacementInfo],
    unmatchedCodeObj: dict[str, UnmatchedCodeObjInfo],
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

    codeObjsToDelete: set[str] = set()

    for id in idsToProcess:
        existingCodeObjId = hierarchy.name_path_to_id.get(
            processedJson.hierarchy.id_to_name_path[id]
        )
        uCodeObj = keyValueInfo.codeObjs[id]
        uVariantId = keyValueInfo.codeObjVariantMap[id]
        uVariant = keyValueInfo.codeObjVariants[uVariantId]
        uImpl = keyValueInfo.codeObjImpls[uVariant.impl]

        if id not in unmatchedCodeObj:
            unmatchedCodeObj[id] = UnmatchedCodeObjInfo(uCodeObj, uImpl)
        if existingCodeObjId:
            variantId = section_impl.codeObjVariantMap[existingCodeObjId]
            impl = get_variant_base_code_obj_impl(p, variantId)
            if type(impl) is type(uImpl):
                effectiveImpl = get_effective_impl(uImpl, uCodeObj, uVariant)
                replacements[id] = ReplacementInfo(existingCodeObjId, effectiveImpl)
            else:
                codeObjsToDelete.add(existingCodeObjId)

    for name_path, id in hierarchy.name_path_to_id.items():
        matchedId = processedJson.hierarchy.name_path_to_id.get(name_path)
        if not matchedId:
            codeObjsToDelete.add(id)

    return codeObjsToDelete


def filter_out_replacements_from_unmatched(
    replacements: dict[str, ReplacementInfo],
    unmatchedCodeObj: dict[str, UnmatchedCodeObjInfo],
):
    for r in replacements.keys():
        unmatchedCodeObj.pop(r, None)


def delete_old_code_objs(p: ProjectStateCore, codeObjsToDelete: set[str]):
    for c in codeObjsToDelete:
        delete_code_obj(p, c)
