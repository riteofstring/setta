from collections import defaultdict

from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseParentCodeObjImpl,
    NestedParamCodeObjImpl,
)
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import get_effective_impl
from setta.types.generated.unions import (
    BaseCodeObjImplUnion,
    BaseDictSectionImplUnion,
)
from setta.types.helpers import get_effective_code_obj_impl
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
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
            variant = p.sectionVariants[variant_id]
            base_impl = p.sectionImpls[variant.impl]
            impl = get_effective_impl(base_impl, section, variant)
            if (
                not isinstance(impl, BaseDictSectionImplUnion)
                or not impl.isJsonSource
                or (section_variant_ids and variant_id not in section_variant_ids)
            ):
                continue
            ancestor_paths = build_ancestor_paths(
                p.codeObjs,
                p.codeObjImpls,
                p.codeObjVariants,
                impl.codeObjVariantMap,
                impl.topLevelParamIds,
            )
            filename = variant.name
            for paramId in impl.topLevelParamIds:
                recursively_add_keys(
                    p,
                    impl,
                    paramId,
                    impl.jsonSourceKeys,
                    ancestor_paths,
                    to_be_saved[filename],
                )

            # Make sure the jsonSourceKeys are present.
            # (They might not be because they are completely empty)
            add_key_path_to_dict(to_be_saved[filename], impl.jsonSourceKeys)

    # Save each file
    for filename, data in to_be_saved.items():
        save_json_to_file(filename, data)


def build_parent_map(
    codeObjs: dict[str, Core],
    codeObjImpls: dict[str, BaseCodeObjImplUnion],
    codeObjVariants: dict[str, Variant],
    codeObjVariantMap: dict[str, str],
    paramIds: list[str],
) -> dict[str, str | None]:
    """Build a map of child -> parent relationships."""
    parent_map: dict[str, str | None] = {pid: None for pid in paramIds}

    def add_children(param_id: str):
        variant_id = codeObjVariantMap[param_id]
        variant = codeObjVariants[variant_id]
        base_impl = codeObjImpls[variant.impl]
        impl = get_effective_impl(base_impl, codeObjs[param_id], variant)

        if isinstance(impl, NestedParamCodeObjImpl):
            for child_id in impl.children:
                parent_map[child_id] = param_id
                add_children(child_id)

    for param_id in paramIds:
        add_children(param_id)

    return parent_map


def build_ancestor_paths(
    codeObjs: dict[str, Core],
    codeObjImpls: dict[str, BaseCodeObjImplUnion],
    codeObjVariants: dict[str, Variant],
    codeObjVariantMap: dict[str, str],
    paramIds: list[str],
) -> dict[str, list[str]]:
    """Build ancestor paths for all nodes in the hierarchy."""
    parent_map = build_parent_map(
        codeObjs, codeObjImpls, codeObjVariants, codeObjVariantMap, paramIds
    )

    ancestor_paths: dict[str, list[str]] = {}
    for id in parent_map.keys():
        if id not in ancestor_paths:
            path = []
            current_id = id

            # Traverse up to build the path
            while current_id is not None:
                if current_id in codeObjs:
                    name = codeObjs[current_id].name
                    path.insert(0, name)

                    # Get parent using the map
                    parent_id = parent_map.get(current_id)
                    current_id = parent_id
                else:
                    break

            ancestor_paths[id] = path

    return ancestor_paths


def recursively_add_keys(
    p: ProjectStateSingleConfig,
    section_impl: BaseDictSectionImplUnion,
    paramId: str,
    jsonSourceKeys: list[str],
    ancestor_paths: dict[str, list[str]],
    output_dict: dict,
):
    codeObjImpl = get_effective_code_obj_impl(p, paramId, section_impl=section_impl)
    if isinstance(codeObjImpl, BaseChildlessCodeObjImpl):
        value = try_json(codeObjImpl.value)
    elif isinstance(codeObjImpl, BaseParentCodeObjImpl):
        value = {}
    else:
        raise TypeError
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


def remove_json_source_values(p):
    for variant in p["sectionVariants"].values():
        if variant["isJsonSource"]:
            variant["values"] = {}
