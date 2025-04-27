import json
import re

from setta.gen_code.find_placeholders import tp
from setta.utils.constants import C


# input is state computed by keyword regex subscription
def get_ev_ref_regex_and_color_map(state):
    names = []
    full_name_to_info = {}
    for sid in state["details"].keys():
        if not state["details"][sid]["is_top_level_and_can_be_referred_to"]:
            continue
        if state["global_variable_id"] == sid:
            set_full_param_regex(
                state, sid, None, names, full_name_to_info, "", [], True
            )
        else:
            curr_name = state["details"][sid]["name"]
            set_full_children_names_for_regex(
                state, names, full_name_to_info, sid, curr_name, [len(curr_name)]
            )

    if len(names) == 0:
        return {
            "pattern": dummy_reg_exp_object(),
            "code_area_pattern": dummy_reg_exp_object(),
            "full_name_to_info": full_name_to_info,
        }

    pattern_str = f"(?<![A-Za-z.\"'_])({('|').join(names)})(?![A-Za-z\"'_])"
    pattern = re.compile(pattern_str, re.MULTILINE)
    code_area_pattern = re.compile(
        f"(?<=.*?\\{tp(C.SETTA_GENERATED_PYTHON)}.*?){pattern_str}",
        re.MULTILINE | re.DOTALL,
    )

    return {
        "pattern": pattern,
        "code_area_pattern": code_area_pattern,
        "full_name_to_info": full_name_to_info,
    }


def set_full_children_names_for_regex(
    state, all_names, full_name_to_info, section_id, parent_name, parent_lengths
):
    section_type_name = state["details"][section_id]["section_type_name"]
    for idx, c in enumerate(state["details"][section_id]["section_children"]):
        name = state["details"][c]["name"]
        curr_component_name = (
            f"[{idx}]" if section_type_name == C.LIST_ROOT else f'["{name}"]'
        )
        curr_full_name = f"{parent_name}{curr_component_name}"
        set_full_children_names_for_regex(
            state,
            all_names,
            full_name_to_info,
            c,
            curr_full_name,
            parent_lengths + [len(curr_full_name)],
        )

    full_name = parent_name
    args_full_name = f"{C.ARGS_PREFIX}{parent_name}"
    args_parent_lengths = [x + len(C.ARGS_PREFIX) for x in parent_lengths]
    set_full_param_regex(
        state,
        section_id,
        state["details"][section_id]["selected_item"],
        all_names,
        full_name_to_info,
        args_full_name,
        args_parent_lengths,
    )

    all_names.append(escape_reg_exp(full_name))
    full_name_to_info[full_name] = {
        "section_id": section_id,
        "param_info_id": None,
        "component_indices": parent_lengths,
        "is_args_obj": False,
    }

    if section_type_name == C["SECTION"]:
        all_names.append(escape_reg_exp(args_full_name))
        full_name_to_info[args_full_name] = {
            "section_id": section_id,
            "param_info_id": None,
            "component_indices": args_parent_lengths,
            "is_args_obj": True,
        }


def set_full_param_regex(
    state,
    section_id,
    code_info_id,
    all_names,
    full_name_to_info,
    parent_name,
    parent_lengths,
    is_global_var=False,
):
    code_info_children = state["details"][section_id]["code_info_children"]
    if code_info_id not in code_info_children:
        return

    child_param_infos = [
        state["code_info"][x] for x in code_info_children[code_info_id]
    ]

    for p in child_param_infos:
        if not p["name"] or p["rc_type"] != C.PARAMETER:
            continue

        full_name = p["name"] if is_global_var else f'{parent_name}["{p["name"]}"]'
        new_lengths_array = parent_lengths + [len(full_name)]
        set_full_param_regex(
            state,
            section_id,
            p["id"],
            all_names,
            full_name_to_info,
            full_name,
            new_lengths_array,
        )

        all_names.append(escape_reg_exp(full_name))
        full_name_to_info[full_name] = {
            "section_id": section_id,
            "param_info_id": p["id"],
            "component_indices": new_lengths_array,
            "is_args_obj": False,
        }


def construct_ev_refs(keyword_positions, full_text):
    output = []
    full_name_to_info = use_ev_ref_regex.get_state()["full_name_to_info"]

    for k in keyword_positions:
        keyword = full_text[k.start_pos : k.end_pos]
        if keyword in full_name_to_info:
            info = full_name_to_info[keyword]
            output.append(
                {
                    "section_id": info["section_id"],
                    "param_info_id": info["param_info_id"],
                    "is_args_obj": info["is_args_obj"],
                    "start_pos": k.start_pos,
                    "keyword": keyword,
                }
            )

    return output


def compute_info_to_full_name():
    output = {}
    for k, v in use_ev_ref_regex.get_state()["full_name_to_info"].items():
        output[
            key_for_info_to_full_name(
                {
                    "section_id": v["section_id"],
                    "param_info_id": v["param_info_id"],
                    "is_args_obj": v["is_args_obj"],
                }
            )
        ] = k

    return output


def key_for_info_to_full_name(info):
    section_id = info["section_id"]
    param_info_id = info.get("param_info_id", None)
    is_args_obj = info.get("is_args_obj", False)

    return json.dumps([section_id, param_info_id, is_args_obj])
