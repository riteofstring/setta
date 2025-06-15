from collections import defaultdict

from setta.types.code_objs import (
    BaseParamCodeObjImpl,
    NestedParamCodeObjImpl,
)
from setta.types.helpers import get_code_obj_impl
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.sections import DictSectionImpl
from setta.utils.utils import save_json_to_file, try_json


def save_json_source_data(
    p: ProjectStateSingleConfig, section_impl_ids: list[str] | None = None
):
    to_be_saved = defaultdict(dict)

    for section_impl_id, section_impl in p.sectionImpls.items():
        if (
            not isinstance(section_impl, DictSectionImpl)
            or not section_impl.isJsonSource
            or (section_impl_ids and section_impl_id not in section_impl_ids)
        ):
            continue
        ancestor_paths = build_ancestor_paths(p, section_impl)
        filename = section_impl.name
        for paramId in section_impl.topLevelParamIds:
            recursively_add_keys(
                p,
                section_impl,
                paramId,
                section_impl.jsonSourceKeys,
                ancestor_paths,
                to_be_saved[filename],
            )

        # Make sure the jsonSourceKeys are present.
        # (They might not be because they are completely empty)
        add_key_path_to_dict(to_be_saved[filename], section_impl.jsonSourceKeys)

    # Save each file
    for filename, data in to_be_saved.items():
        save_json_to_file(filename, data)


def add_children_to_parent_map(
    p: ProjectStateSingleConfig,
    section_impl: DictSectionImpl,
    paramId: str,
    parent_map: dict[str, str | None],
):
    codeObjImpl = get_code_obj_impl(p, paramId, section_impl=section_impl)
    if isinstance(codeObjImpl, NestedParamCodeObjImpl):
        for childId in codeObjImpl.children:
            parent_map[childId] = paramId
            add_children_to_parent_map(p, section_impl, childId, parent_map)


def build_parent_map(p: ProjectStateSingleConfig, section_impl: DictSectionImpl):
    parent_map: dict[str, str | None] = {}
    for paramId in section_impl.topLevelParamIds:
        parent_map[paramId] = None
        add_children_to_parent_map(p, section_impl, paramId, parent_map)
    return parent_map


def build_ancestor_paths(p: ProjectStateSingleConfig, section_impl: DictSectionImpl):
    parent_map = build_parent_map(p, section_impl)
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
    paramId: str,
    jsonSourceKeys: list[str],
    ancestor_paths: dict[str, list[str]],
    output_dict: dict,
):
    codeObjImpl = get_code_obj_impl(p, paramId, section_impl=section_impl)
    if not isinstance(codeObjImpl, BaseParamCodeObjImpl):
        raise TypeError
    key_path = [*jsonSourceKeys, *ancestor_paths[paramId]]
    value = try_json(codeObjImpl.value)
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
