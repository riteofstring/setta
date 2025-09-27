import logging
from pathlib import Path
from typing import Iterable

from setta.project_state.jsonSource import (
    MetadataTupleToId,
    ProcessedJSONInfo,
    createMetadataTuple,
    createMetadataTupleToId,
)
from setta.types.code_obj_impls import (
    BaseCodeObjImpl,
)
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import (
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseDictSectionImplArgsWithCallable,
)
from setta.types.generated.unions import (
    BaseDictSectionImplUnion,
)
from setta.types.helpers_lvl1 import (
    get_variant_base_and_effective_section_impl,
)
from setta.types.helpers_lvl2 import (
    get_code_obj_variant_map_update_fn,
)
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_state import (
    ProjectStateCore,
)

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
                not isinstance(base_impl, BaseDictSectionImplUnion)
                or not isinstance(impl, BaseDictSectionImplUnion)
                or not impl.isJsonSource
                or (section_variant_ids and variant_id not in section_variant_ids)
            ):
                continue
            print("variant_id", variant_id)
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
                filename,
                processedJson,
                section,
                base_impl,
                impl,
                variant,
            )


def merge_into_existing(
    p: ProjectStateCore,
    filename: Path,
    new_data: ProcessedJSONInfo,
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
    jsonSourceMetadataTupleToId: MetadataTupleToId = createMetadataTupleToId(
        filename, hierarchy
    )
    processedJson = new_data.processedJson

    replacements: dict[str, tuple[str, BaseCodeObjImpl]] = {}
    for newId, newCodeObj in processedJson.codeObjs.items():
        existingCodeObjId = jsonSourceMetadataTupleToId.get(
            createMetadataTuple(filename, new_data.hierarchy.name_path_map[newId])
        )
        newVariantId = processedJson.sectionImpl.codeObjVariantMap[newId]
        newVariant = processedJson.codeObjVariants[newVariantId]
        newImpl = processedJson.codeObjImpls[newVariant.impl]
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

    # for newId, (existingCodeObjId, newImpl) in replacements.items():
    #     variantId = section_impl.codeObjVariantMap[existingCodeObjId]
    #     codeObjCore = p.codeObjs[existingCodeObjId]
    #     variant, baseCodeObjImpl, impl = get_variant_base_and_effective_code_obj_impl(
    #         p, codeObjCore, variantId
    #     )
    #     if (
    #         isinstance(baseCodeObjImpl, NestedParamCodeObjImpl)
    #         and isinstance(impl, NestedParamCodeObjImpl)
    #         and isinstance(newImpl, NestedParamCodeObjImpl)
    #     ):
    #         impl = set_effective_impl_value(
    #             baseCodeObjImpl,
    #             codeObjCore,
    #             variant,
    #             NestedParamCodeObjImplArgsWithCallable(
    #                 children=[
    #                     replacements[c][0] if c in replacements else c
    #                     for c in newImpl.children
    #                 ]
    #             ),
    #         )
    #     elif (
    #         isinstance(baseCodeObjImpl, BaseChildlessCodeObjImplUnion)
    #         and isinstance(impl, BaseChildlessCodeObjImplUnion)
    #         and isinstance(newImpl, BaseChildlessCodeObjImplUnion)
    #     ):
    #         impl = set_effective_impl_value(
    #             baseCodeObjImpl,
    #             codeObjCore,
    #             variant,
    #             BaseChildlessCodeObjImplArgsWithCallable(value=newImpl.value),
    #         )
    #     else:
    #         raise TypeError

    # to_delete_from_code_obj_variant_map: set[str] = set()
    # for metadataString, id in jsonSourceMetadata_to_id.items():
    #     newId = new_jsonSourceMetadata_to_id.get(metadataString)
    #     if not newId:
    #         variantId = section_impl.codeObjVariantMap[id]
    #         variant = p.codeObjVariants[variantId]
    #         impl = p.codeObjImpls[variant.impl]
    #         to_delete_from_code_obj_variant_map.add(id)
    #         del p.codeObjs[id]
    #         del p.codeObjImpls[impl.id]
    #         del p.codeObjVariants[variantId]

    # set_effective_impl_value(
    #     base_section_impl,
    #     section,
    #     section_variant,
    #     BaseDictSectionImplArgsWithCallable(
    #         topLevelParamIds=[
    #             replacements[c][0] if c in replacements else c
    #             for c in new_data.sectionImpl.topLevelParamIds
    #         ],
    #         codeObjVariantMap=lambda curr: {
    #             k: v
    #             for k, v in curr.items()
    #             if k not in to_delete_from_code_obj_variant_map
    #         },
    #     ),
    # )
