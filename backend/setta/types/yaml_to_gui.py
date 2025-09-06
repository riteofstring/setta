import json
from typing import Dict, List, Any, Optional, Set, Tuple

from setta.types.helpers import (
    get_curr_section_variant,
    get_variant_base_and_effective_section_impl_with_type_guard,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import BaseSectionWithParamsImpl

# Assuming these imports exist as mentioned
from state.actions.section_infos import get_section_type
from state.definitions import use_original_yaml_obj, use_project_state, use_yaml_value
from utils.id_name_creation import create_new_id
from gui_to_yaml_parsing import parse_raw_dump, split_documents
from section_infos import get_code_children_and_parent_code_info_id

# Assuming these exist
from enums import UITypeNameEnum, CodeInfoTypeEnum
from utils import (
    create_code_info,
    create_ev_entry,
    get_or_create_code_info_col,
    get_code_info_col,
    set_entered_value,
)


def yaml_to_gui(p: ProjectStateSingleConfig, section_id: str) -> None:
    variant_id = p.projectConfig.sectionVariantMap[section_id]
    # get_variant_base_and_effective_section_impl_with_type_guard(
    #     p, p.sections[section_id], variant_id, BaseSectionWithParamsImpl
    # )
    # original_obj = use_original_yaml_obj.get_state().get(variant_id, {})
    yaml_value = p.yamlValues[variant_id]
    section_yaml_to_gui(section_id, yaml_value, original_obj)


def section_yaml_to_gui(
    p: ProjectStateSingleConfig, section_id: str, yaml_value: str, original_obj: dict
):
    documents = split_documents(yaml_value)
    selected_item_name = None
    pinned = {}
    unpinned = {}

    if len(documents) == 3:
        selected_item_name, pinned, unpinned = documents
    elif len(documents) == 2:
        pinned, unpinned = documents
    else:
        unpinned = documents[0] if documents else ""

    try:
        pinned = parse_raw_dump(pinned) if pinned.strip() else {}
        unpinned = parse_raw_dump(unpinned) if unpinned.strip() else {}
    except:
        # This will happen if the yaml is not in the expected format
        return

    f_original_obj = merge_pinned_and_unpinned(
        flatten_object(original_obj.get("pinned", {})),
        flatten_object(original_obj.get("unpinned", {})),
    )
    f_new_obj = merge_pinned_and_unpinned(
        flatten_object(pinned, True), flatten_object(unpinned, True)
    )

    output = []
    used_original_ids = set()
    used_paths = set()

    # Match by key
    for v in f_original_obj:
        if v["id"] in used_original_ids:
            continue
        matches = [
            x
            for x in f_new_obj
            if x["key"] == v["key"] and json.dumps(x["keyPath"]) not in used_paths
        ]
        if matches:
            sort_paths_by_similarity(matches, v["keyPath"])
            update_outputs(v, matches, used_original_ids, used_paths, output)

    # Match by value
    for v in f_original_obj:
        if v["id"] in used_original_ids:
            continue
        matches = [
            x
            for x in f_new_obj
            if x["value"] == v["value"] and json.dumps(x["keyPath"]) not in used_paths
        ]
        if matches:
            sort_paths_by_similarity(matches, v["keyPath"])
            update_outputs(v, matches, used_original_ids, used_paths, output)

    # Add remaining new entries
    for v in f_new_obj:
        if json.dumps(v["keyPath"]) in used_paths:
            continue
        curr = {
            "key": v["key"],
            "keyPath": v["keyPath"],
            "value": v["value"],
            "isPinned": v["isPinned"],
        }
        curr["id"] = create_new_id()
        curr["isNewParam"] = True
        output.append(curr)

    key_path_to_index = {}
    for idx, v in enumerate(f_new_obj):
        key_path_to_index[json.dumps(v["keyPath"])] = idx

    output.sort(
        key=lambda x: key_path_to_index.get(json.dumps(x["keyPath"]), float("inf"))
    )

    # TODO: what should editing selectedName do? The following assumes it has no effect.
    parent_code_info_id, _ = get_code_children_and_parent_code_info_id(
        section_id, state
    )
    ids_to_children = {parent_code_info_id: []}
    for v in output:
        ids_to_children[v["id"]] = []

    # Process everything except pinned parameters that already exist
    update_ids_to_children(
        section_id=section_id,
        ids_to_children=ids_to_children,
        output=output,
        to_process=[
            v for v in output if not (v.get("isPinned") and not v.get("isNewParam"))
        ],
        input_parent_id=parent_code_info_id,
        insert_at_original_idx=False,
    )

    # Pinned parameters that already exist should be inserted at their original indices
    update_ids_to_children(
        section_id=section_id,
        ids_to_children=ids_to_children,
        output=output,
        to_process=[v for v in output if v.get("isPinned") and not v.get("isNewParam")],
        input_parent_id=parent_code_info_id,
        insert_at_original_idx=True,
    )

    c_state = state["codeInfo"]
    new_infos = {}
    updated_infos = {}
    param_info_id_to_value = {}
    default_value = create_ev_entry()["value"]

    for v in output:
        if v["id"] not in c_state:
            new_infos[v["id"]] = create_code_info(
                id=v["id"],
                name=v["key"],
                editable=v.get("editable", True),
                rc_type=CodeInfoTypeEnum.PARAMETER,
                is_pinned=v.get("isPinned"),
            )
        else:
            updated_infos[v["id"]] = {"name": v["key"], "isPinned": v.get("isPinned")}

        if v.get("value") != default_value:
            param_info_id_to_value[v["id"]] = v["value"]

    def state_update(x):
        x["codeInfo"] = {**x["codeInfo"], **new_infos}
        for id_, new_attrs in updated_infos.items():
            for k, v in new_attrs.items():
                x["codeInfo"][id_][k] = v

        variant_id = x["sections"][section_id]["variant_id"]
        variant = x["variants"][variant_id]
        for id_, new_children in ids_to_children.items():
            get_or_create_code_info_col(variant, x)["children"][id_] = new_children

        for id_, value in param_info_id_to_value.items():
            set_entered_value(variant_id, id_, value, x)

    use_project_state.set_state(state_update)


def update_outputs(
    v: Dict, matches: List[Dict], used_original_ids: Set, used_paths: Set, output: List
) -> None:
    curr = {
        "key": matches[0]["key"],
        "keyPath": matches[0]["keyPath"],
        "value": matches[0]["value"],
        "isPinned": matches[0]["isPinned"],
    }
    curr["id"] = v["id"]
    curr["editable"] = v.get("editable")
    output.append(curr)
    used_original_ids.add(v["id"])
    used_paths.add(json.dumps(curr["keyPath"]))


def flatten_object(obj: Any, is_pretty_obj: bool = False) -> List[Dict]:
    result = []

    def flatten(
        id_: Optional[str], item: Any, editable: Optional[bool], key_path: List[str]
    ):
        if isinstance(item, dict) and item is not None:
            if key_path:
                result.append(
                    {
                        "id": id_,
                        "keyPath": key_path,
                        "value": None,
                        "editable": editable,
                        "key": key_path[-1],
                    }
                )

            for key, value in item.items():
                new_key_path = key_path + [key]
                if is_pretty_obj:
                    flatten(None, value, None, new_key_path)
                else:
                    flatten(
                        value.get("id"),
                        value.get("value"),
                        value.get("editable"),
                        new_key_path,
                    )
        else:
            result.append(
                {
                    "id": id_,
                    "keyPath": key_path,
                    "value": item,
                    "editable": editable,
                    "key": key_path[-1] if key_path else None,
                }
            )

    flatten(None, obj, None, [])
    return result


def calculate_path_similarity(path1: List[str], path2: List[str]) -> float:
    """Calculate similarity between two YAML paths"""
    min_length = min(len(path1), len(path2))
    max_length = max(len(path1), len(path2))
    common_elements = 0

    for i in range(min_length):
        if path1[-(i + 1)] == path2[-(i + 1)]:
            common_elements += 1
        else:
            break

    # Similarity is based on common elements from the end and penalized for length difference
    if max_length == 0:
        return 0
    return (common_elements / max_length) * (min_length / max_length)


def sort_paths_by_similarity(matches: List[Dict], reference_path: List[str]) -> None:
    """Sort list of YAML paths based on similarity to reference path"""
    matches.sort(
        key=lambda x: calculate_path_similarity(x["keyPath"], reference_path),
        reverse=True,
    )


def merge_pinned_and_unpinned(pinned: List[Dict], unpinned: List[Dict]) -> List[Dict]:
    for p in unpinned:
        p["isPinned"] = False

    pinned_not_in_unpinned = []
    for p in pinned:
        match = next((x for x in unpinned if x["keyPath"] == p["keyPath"]), None)
        if not match:
            pinned_not_in_unpinned.append({**p, "isPinned": True})

    return pinned_not_in_unpinned + unpinned


def update_ids_to_children(
    section_id: str,
    ids_to_children: Dict,
    output: List[Dict],
    to_process: List[Dict],
    input_parent_id: str,
    insert_at_original_idx: bool,
) -> None:
    for v in to_process:
        parent_id = input_parent_id

        if len(v["keyPath"]) > 1:
            # Find parent
            match = next((x for x in output if x["keyPath"] == v["keyPath"][:-1]), None)
            if match:
                parent_id = match["id"]
            else:
                continue

        if insert_at_original_idx:
            original_idx = get_code_info_col(section_id)["children"][parent_id].index(
                v["id"]
            )
            ids_to_children[parent_id].insert(original_idx, v["id"])
        else:
            ids_to_children[parent_id].append(v["id"])
