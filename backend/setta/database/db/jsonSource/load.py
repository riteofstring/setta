import logging
from pathlib import Path
from typing import Iterable

from setta.project_state.jsonSource import (
    ProcessedJSONInfo,
)
from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseCodeObjImpl,
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
from setta.types.helpers_lvl1 import (
    get_variant_base_and_effective_code_obj_impl,
    get_variant_base_and_effective_section_impl,
)
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_state import (
    ProjectStateCore,
)
from setta.types.section_impls import BaseDictSectionImpl

logger = logging.getLogger(__name__)


def load_json_sources_into_data_structures(
    p: ProjectStateCore,
    json_sources: dict[Path, ProcessedJSONInfo],
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
            merge_into_existing(
                p,
                processedJson,
                section,
                base_impl,
                impl,
                variant,
            )


def merge_into_existing(
    p: ProjectStateCore,
    new_data: ProcessedJSONInfo,
    section: Core,
    base_section_impl: BaseDictSectionImpl,
    section_impl: BaseDictSectionImpl,
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
            build_id_to_name_path=True,
            build_name_path_to_id=True,
            name_path_prefix=tuple(section_impl.jsonSourceKeys),
        ),
    )
    keyValueInfo = new_data.keyValueInfo
    newIdsToProcess = new_data.hierarchy.name_path_to_descendant_ids.get(
        tuple(section_impl.jsonSourceKeys), []
    )

    replacements: dict[str, tuple[str, BaseCodeObjImpl]] = {}
    newCodeObjVariantMapEntries: dict[str, str] = {}
    for newId in newIdsToProcess:
        existingCodeObjId = hierarchy.name_path_to_id.get(
            new_data.hierarchy.id_to_name_path[newId]
        )
        newCodeObj = keyValueInfo.codeObjs[newId]
        newVariantId = keyValueInfo.codeObjVariantMap[newId]
        newVariant = keyValueInfo.codeObjVariants[newVariantId]
        newImpl = keyValueInfo.codeObjImpls[newVariant.impl]
        if not existingCodeObjId:
            newCodeObjVariantMapEntries[newId] = newVariantId
            p.codeObjVariants[newVariantId] = newVariant
            p.codeObjImpls[newImpl.id] = newImpl
            p.codeObjs[newId] = newCodeObj
        else:
            newEffectiveImpl = get_effective_impl(newImpl, newCodeObj, newVariant)
            replacements[newId] = (existingCodeObjId, newEffectiveImpl)

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
            isinstance(baseCodeObjImpl, BaseChildlessCodeObjImpl)
            and isinstance(impl, BaseChildlessCodeObjImpl)
            and isinstance(newImpl, BaseChildlessCodeObjImpl)
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
    for name_path, id in hierarchy.name_path_to_id.items():
        newId = new_data.hierarchy.name_path_to_id.get(name_path)
        if not newId:
            variantId = section_impl.codeObjVariantMap[id]
            variant = p.codeObjVariants[variantId]
            impl = p.codeObjImpls[variant.impl]
            to_delete_from_code_obj_variant_map.add(id)
            del p.codeObjs[id]
            del p.codeObjImpls[impl.id]
            del p.codeObjVariants[variantId]

    newTopLevelParamIds = new_data.jsonSourceKeyToTopLevelIds[
        tuple(section_impl.jsonSourceKeys)
    ]
    set_effective_impl_value(
        base_section_impl,
        section,
        section_variant,
        BaseDictSectionImplArgsWithCallable(
            topLevelParamIds=[
                replacements[c][0] if c in replacements else c
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
