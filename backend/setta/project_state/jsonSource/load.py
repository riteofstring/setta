from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from setta.project_state.jsonSource.jsonSource import (
    ProcessedJSONInfo,
)
from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseParentCodeObjImpl,
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
    get_variant_base_and_effective_section_impl_with_type_guard,
    get_variant_base_code_obj_impl,
)
from setta.types.helpers_lvl2 import (
    create_new_code_obj_variant,
    delete_code_obj,
    get_top_level_param_ids,
)
from setta.types.hierarchy_traversal import (
    TraversalOptions,
    traverse_hierarchy,
)
from setta.types.id import ID
from setta.types.project_state import (
    ProjectStateCore,
)
from setta.types.section_impls import BaseDictSectionImpl
from setta.utils.utils import normalize_path


@dataclass
class ReplacementInfo:
    existingCodeObjId: ID
    matchedImpl: BaseCodeObjImplUnionWithDiscriminator


@dataclass
class UnmatchedCodeObjInfo:
    codeObj: Core
    codeObjImpl: BaseCodeObjImplUnionWithDiscriminator


@dataclass
class ReplacementsAndUnmatchedDicts:
    replacements: dict[str, ReplacementInfo] = field(default_factory=dict)
    unmatched: dict[str, UnmatchedCodeObjInfo] = field(default_factory=dict)


FilenameToKeysToReplacementsAndUnmatchedDicts = dict[
    Path, dict[tuple[str, ...], ReplacementsAndUnmatchedDicts]
]


@dataclass
class SectionVariantToUpdate:
    section: Core
    baseImpl: BaseDictSectionImplUnionWithDiscriminator
    impl: BaseDictSectionImplUnionWithDiscriminator
    variant: Variant
    processedJson: ProcessedJSONInfo
    filename: Path
    jsonSourceKeys: tuple[str, ...]


def load_json_sources_into_data_structures(
    p: ProjectStateCore,
    json_sources: dict[Path, ProcessedJSONInfo],
    section_variant_ids: Iterable[tuple[ID, ID]],
):
    section_variant_set = set(section_variant_ids)
    # set of (filename, jsonSourceKeys)
    jsonSourceAndKeysToLoad: set[tuple[Path, tuple[str, ...]]] = set()
    for s, v in section_variant_set:
        variant, _, impl = get_variant_base_and_effective_section_impl_with_type_guard(
            p, p.sections[s], v, BaseDictSectionImpl
        )
        filename = normalize_path(variant.name)
        jsonSourceAndKeysToLoad.add((filename, tuple(impl.jsonSourceKeys)))

    # maps from filepath, to jsonSourceKeys to ReplacementsAndUnmatchedDicts
    replacements_and_unmatched: FilenameToKeysToReplacementsAndUnmatchedDicts = {}
    sectionVariantsToUpdate: dict[tuple[ID, ID], SectionVariantToUpdate] = {}
    codeObjsToDelete: set[ID] = set()
    processedVariantIds: set[ID] = set()

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
            filename = normalize_path(variant.name)
            jsonSourceKeys = tuple(impl.jsonSourceKeys)
            if (filename, jsonSourceKeys) not in jsonSourceAndKeysToLoad:
                continue
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
            r = replacements_and_unmatched.setdefault(filename, {}).setdefault(
                jsonSourceKeys, ReplacementsAndUnmatchedDicts()
            )
            currCodeObjsToDelete = compute_existing_replacement_mapping(
                p,
                processedJson,
                impl,
                r.replacements,
                r.unmatched,
            )
            if (section.id, variant_id) in section_variant_set:
                sectionVariantsToUpdate[(section.id, variant_id)] = (
                    SectionVariantToUpdate(
                        section,
                        base_impl,
                        impl,
                        variant,
                        processedJson,
                        filename,
                        jsonSourceKeys,
                    )
                )
                codeObjsToDelete.update(currCodeObjsToDelete)

    for jToR in replacements_and_unmatched.values():
        for r in jToR.values():
            filter_out_replacements_from_unmatched(r.replacements, r.unmatched)

    delete_old_code_objs(p, codeObjsToDelete)

    for toUpdate in sectionVariantsToUpdate.values():
        r = replacements_and_unmatched[toUpdate.filename][toUpdate.jsonSourceKeys]
        merge_into_existing(p, toUpdate, r.replacements, r.unmatched, codeObjsToDelete)


def merge_into_existing(
    p: ProjectStateCore,
    to_update: SectionVariantToUpdate,
    replacements: dict[str, ReplacementInfo],
    unmatchedCodeObj: dict[str, UnmatchedCodeObjInfo],
    codeObjsToDelete: set[ID],
):
    newCodeObjVariantMapEntries: dict[ID, ID] = {}
    for r in replacements.values():
        codeObjCore = p.codeObjs[r.existingCodeObjId]
        variantId = to_update.impl.codeObjVariantMap.get(r.existingCodeObjId)
        if not variantId:
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

    newTopLevelParamId = to_update.processedJson.hierarchy.name_path_to_id[
        tuple(to_update.impl.jsonSourceKeys)
    ]
    if newTopLevelParamId in replacements:
        newTopLevelParamId = replacements[newTopLevelParamId].existingCodeObjId
    set_effective_impl_value(
        to_update.baseImpl,
        to_update.section,
        to_update.variant,
        BaseDictSectionImplArgsWithCallable(
            topLevelParamId=newTopLevelParamId,
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
    topLevelParamIds = get_top_level_param_ids(p, section_impl)
    jsonSourceKeys = tuple(section_impl.jsonSourceKeys)
    hierarchy = traverse_hierarchy(
        p.codeObjs,
        p.codeObjImpls,
        p.codeObjVariants,
        section_impl.codeObjVariantMap,
        topLevelParamIds,
        section_impl.topLevelParamId,
        options=TraversalOptions(
            collect_all_visited=True,
            build_id_to_name_path=True,
            build_name_path_to_id=True,
            name_path_prefix=jsonSourceKeys,
        ),
    )

    codeObjsToDelete: set[ID] = set()
    keyValueInfo = processedJson.keyValueInfo

    idsToProcess: set[ID] = set()
    if jsonSourceKeys in processedJson.hierarchy.name_path_to_id:
        idsToProcess = processedJson.hierarchy.name_path_to_descendant_ids.get(
            jsonSourceKeys, set()
        )
        idsToProcess.add(processedJson.hierarchy.name_path_to_id[jsonSourceKeys])
        idsToProcess = idsToProcess.difference(replacements.keys())

    for id in idsToProcess:
        existingCodeObjId = hierarchy.name_path_to_id.get(
            processedJson.hierarchy.id_to_name_path[id]
        )
        uCodeObj = keyValueInfo.codeObjs[id]
        uVariantId = keyValueInfo.codeObjVariantMap[id]
        uVariant = keyValueInfo.codeObjVariants[uVariantId]
        uImpl = keyValueInfo.codeObjImpls[uVariant.impl]

        if id not in unmatchedCodeObj:
            # .model_copy is important because currently
            # if multiple sections point to the same json
            # then they can end up pointing to the same unmatchedCodeObj
            unmatchedCodeObj[id] = UnmatchedCodeObjInfo(
                uCodeObj.model_copy(deep=True), uImpl.model_copy(deep=True)
            )
        if existingCodeObjId:
            variantId = section_impl.codeObjVariantMap[existingCodeObjId]
            impl = get_variant_base_code_obj_impl(p, variantId)
            if (
                isinstance(impl, BaseParentCodeObjImpl)
                and isinstance(uImpl, BaseChildlessCodeObjImpl)
            ) or (
                isinstance(impl, BaseChildlessCodeObjImpl)
                and isinstance(uImpl, BaseParentCodeObjImpl)
            ):
                codeObjsToDelete.add(existingCodeObjId)
            else:
                effectiveImpl = get_effective_impl(uImpl, uCodeObj, uVariant)
                replacements[id] = ReplacementInfo(existingCodeObjId, effectiveImpl)

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


def delete_old_code_objs(p: ProjectStateCore, codeObjsToDelete: set[ID]):
    for c in codeObjsToDelete:
        delete_code_obj(p, c)
