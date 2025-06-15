from collections import defaultdict

from setta.types.project_state import (
    CodeInfo,
    CodeInfoCol,
    ProjectStateSingleConfig,
)
from setta.types.sections import SectionVariant
from setta.utils.utils import save_json_to_file, try_json


def save_json_source_data(p: ProjectStateSingleConfig, variant_ids=None):
    to_be_saved = defaultdict(dict)

    for variant_id, variant in p.variants.items():
        if not variant.isJsonSource:
            continue
        if variant_ids and variant_id not in variant_ids:
            continue
        codeInfoColId = variant.codeInfoColId
        if not codeInfoColId:
            continue
        codeInfoCol = p.codeInfoCols[codeInfoColId]
        filename = variant.name
        ancestor_paths = build_ancestor_paths(p.codeInfo, codeInfoCol.children)
        recursively_add_keys(
            variant,
            codeInfoCol,
            to_be_saved[filename],
            None,
            variant.jsonSourceKeys,
            ancestor_paths,
        )

        # Make sure the jsonSourceKeys are present.
        # (They might not be because they are completely empty)
        add_key_path_to_dict(to_be_saved[filename], variant.jsonSourceKeys)

    # Save each file
    for filename, data in to_be_saved.items():
        save_json_to_file(filename, data)

    return to_be_saved


def build_ancestor_paths(
    codeInfo: dict[str, CodeInfo], codeInfoColChildren: dict[str | None, list[str]]
):
    parent_map: dict[str, str | None] = {}
    for parent_id, children in codeInfoColChildren.items():
        for child_id in children:
            parent_map[child_id] = parent_id

    ancestor_paths: dict[str, list[str]] = {}
    for id in parent_map.keys():
        if id not in ancestor_paths:
            path = []
            current_id = id

            # Traverse up to build the path
            while current_id is not None:
                if current_id in codeInfo:  # Skip if not a valid codeInfo node
                    name = codeInfo[current_id].name
                    path.insert(0, name)

                    # Get parent using the map
                    parent_id = parent_map.get(current_id)
                    current_id = parent_id
                else:
                    break

            ancestor_paths[id] = path

    return ancestor_paths


def recursively_add_keys(
    variant: SectionVariant,
    codeInfoCol: CodeInfoCol,
    output_dict: dict,
    codeInfoId: str | None,
    jsonSourceKeys: list[str],
    ancestor_paths: dict[str, list[str]],
):
    for k in codeInfoCol.children[codeInfoId]:
        children = codeInfoCol.children[k]

        # Get pre-computed key path
        key_path = [*jsonSourceKeys, *ancestor_paths[k]]
        value = try_getting_value(variant, k, children)
        current_dict = add_key_path_to_dict(output_dict, key_path[:-1])

        # Set the value at the final position
        if key_path:  # Only set if we have a path
            current_dict[key_path[-1]] = value

        recursively_add_keys(
            variant, codeInfoCol, output_dict, k, jsonSourceKeys, ancestor_paths
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
