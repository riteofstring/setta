from collections import defaultdict

from setta.types.code_objs import (
    NestedParamCodeObjImpl,
)
from setta.types.helpers import get_code_obj_impl_from_section_impl
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.sections import DictSectionImpl
from setta.utils.utils import save_json_to_file, try_json


def save_json_source_data(p: ProjectStateSingleConfig, section_impl_ids=None):
    to_be_saved = defaultdict(dict)

    for section_impl_id, section_impl in p.sectionImpls.items():
        if (
            not isinstance(section_impl, DictSectionImpl)
            or not section_impl.isJsonSource
        ):
            continue
        if section_impl_ids and section_impl_id not in section_impl_ids:
            continue
        ancestor_paths = build_ancestor_paths(p, section_impl)
        filename = section_impl.name
        recursively_add_keys(
            section_impl,
            to_be_saved[filename],
            None,
            variant.jsonSourceKeys,
            ancestor_paths,
        )

        # Make sure the jsonSourceKeys are present.
        # (They might not be because they are completely empty)
        add_key_path_to_dict(to_be_saved[filename], impl.jsonSourceKeys)

    # Save each file
    for filename, data in to_be_saved.items():
        save_json_to_file(filename, data)

    return to_be_saved


def build_ancestor_paths(p: ProjectStateSingleConfig, section_impl: DictSectionImpl):
    parent_map: dict[str, str | None] = {}
    for paramId in section_impl.paramIds:
        codeObjImpl = get_code_obj_impl_from_section_impl(p, section_impl, paramId)
        if isinstance(codeObjImpl, NestedParamCodeObjImpl):
            for childId in codeObjImpl.children:
                parent_map[childId] = paramId
        parent_map[paramId] = None

    ancestor_paths: dict[str, list[str]] = {}
    for id in parent_map.keys():
        if id not in ancestor_paths:
            path = []
            current_id = id

            # Traverse up to build the path
            while current_id is not None:
                if current_id in p.codeObjs:
                    name = p.codeObjs[current_id].name
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
    section_impl: DictSectionImpl,
    output_dict: dict,
    jsonSourceKeys: list[str],
    ancestor_paths: dict[str, list[str]],
):
    for k in section_impl.paramIds:
        codeObjImpl = get_code_obj_impl_from_section_impl(p, section_impl, k)

        # Get pre-computed key path
        key_path = [*jsonSourceKeys, *ancestor_paths[k]]
        value = try_getting_value(variant, k, children)
        current_dict = add_key_path_to_dict(output_dict, key_path[:-1])

        # Set the value at the final position
        if key_path:  # Only set if we have a path
            current_dict[key_path[-1]] = value

        recursively_add_keys(
            p, section_impl, output_dict, jsonSourceKeys, ancestor_paths
        )


def add_key_path_to_dict(output: dict, key_path: list[str]):
    for path_part in key_path:
        # Create nested dictionaries if they don't exist
        if path_part not in output:
            output[path_part] = {}
        output = output[path_part]
    return output


def try_getting_value(
    variant: SectionVariant, codeInfoId: str, codeInfoChildren: list[str]
):
    if len(codeInfoChildren) == 0:
        if codeInfoId in variant.values:
            return try_json(variant.values[codeInfoId].value)
        return ""
    return {}


def remove_json_source_values(p):
    for variant in p["sectionVariants"].values():
        if variant["isJsonSource"]:
            variant["values"] = {}
