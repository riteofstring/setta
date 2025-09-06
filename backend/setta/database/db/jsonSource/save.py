# refactored_file2.py (original second file, refactored)
from collections import defaultdict

from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseParentCodeObjImpl,
    NestedParamCodeObjImpl,
)
from setta.types.generated.unions import BaseDictSectionImplUnion
from setta.types.helpers import (
    get_variant_base_and_effective_code_obj_impl,
    get_variant_base_and_effective_section_impl,
)

# Import from new shared utilities
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_state import ProjectStateSingleConfig
from setta.utils.utils import save_json_to_file, try_json


def save_json_source_data(
    p: ProjectStateSingleConfig, section_variant_ids: list[str] | None = None
):
    to_be_saved = defaultdict(dict)
    processed = set()
    for section in p.sections.values():
        for variant_id in section.variants:
            if variant_id in processed:
                continue
            processed.add(variant_id)
            variant, _, impl = get_variant_base_and_effective_section_impl(
                p, section, variant_id
            )
            if (
                not isinstance(impl, BaseDictSectionImplUnion)
                or not impl.isJsonSource
                or (section_variant_ids and variant_id not in section_variant_ids)
            ):
                continue
            hierarchy = traverse_hierarchy(
                p.codeObjs,
                p.codeObjImpls,
                p.codeObjVariants,
                impl.codeObjVariantMap,
                impl.topLevelParamIds,
                TraversalOptions(
                    collect_all_visited=True,
                    build_name_paths=True,
                ),
            )

            filename = variant.name
            for paramId in impl.topLevelParamIds:
                recursively_add_keys(
                    p,
                    impl,
                    paramId,
                    impl.jsonSourceKeys,
                    hierarchy.name_path_map,
                    to_be_saved[filename],
                )

            # Make sure the jsonSourceKeys are present.
            # (They might not be because they are completely empty)
            add_key_path_to_dict(to_be_saved[filename], impl.jsonSourceKeys)

    # Save each file
    for filename, data in to_be_saved.items():
        save_json_to_file(filename, data)


def recursively_add_keys(
    p: ProjectStateSingleConfig,
    section_impl: BaseDictSectionImplUnion,
    paramId: str,
    jsonSourceKeys: list[str],
    ancestor_paths: dict[str, list[str]],
    output_dict: dict,
):
    codeObjVariantId = section_impl.codeObjVariantMap[paramId]
    _, _, codeObjImpl = get_variant_base_and_effective_code_obj_impl(
        p, p.codeObjs[paramId], codeObjVariantId
    )
    if isinstance(codeObjImpl, BaseChildlessCodeObjImpl):
        value = try_json(codeObjImpl.value)
    elif isinstance(codeObjImpl, BaseParentCodeObjImpl):
        value = {}
    else:
        raise TypeError(
            f"Unexpected code object implementation type: {type(codeObjImpl)}"
        )

    key_path = [*jsonSourceKeys, *ancestor_paths[paramId]]
    current_dict = add_key_path_to_dict(output_dict, key_path[:-1])
    if key_path:  # Only set if we have a path
        current_dict[key_path[-1]] = value

    if isinstance(codeObjImpl, NestedParamCodeObjImpl):
        for childId in codeObjImpl.children:
            recursively_add_keys(
                p, section_impl, childId, jsonSourceKeys, ancestor_paths, output_dict
            )


def add_key_path_to_dict(output: dict, key_path: list[str]):
    for path_part in key_path:
        # Create nested dictionaries if they don't exist
        if path_part not in output:
            output[path_part] = {}
        output = output[path_part]
    return output


def remove_json_source_values(p: dict):
    for variant in p["sectionVariants"].values():
        if variant["isJsonSource"]:
            variant["values"] = {}
