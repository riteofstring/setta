import re

from setta.code_gen.export_selected import (
    get_code_info_children,
    get_section_children,
    get_section_name,
    get_section_type,
    get_selected_item,
)
from setta.project_state.code_task_fns.utils import escape_reg_exp
from setta.utils.constants import C


def get_ev_ref_regex(p):
    names = []
    full_name_to_info = {}
    for sid in p["sections"].keys():
        section_type_name = get_section_type(p, sid)
        if not is_top_level_and_can_be_referred_to(p, sid, section_type_name):
            continue
        if section_type_name == C.GLOBAL_VARIABLES:
            set_full_param_regex(p, sid, None, names, full_name_to_info, "", [], True)
        else:
            curr_name = get_section_name(p, sid)
            set_full_children_names_for_regex(
                p, names, full_name_to_info, sid, curr_name, [len(curr_name)]
            )

    if len(names) == 0:
        return None, full_name_to_info

    pattern_str = f"(?<![A-Za-z.\"'_])({('|').join(names)})(?![A-Za-z\"'_])"
    pattern = re.compile(pattern_str)

    return pattern, full_name_to_info


def set_full_children_names_for_regex(
    p, all_names, full_name_to_info, section_id, parent_name, parent_lengths
):
    section_type_name = get_section_type(p, section_id)
    for idx, c in enumerate(get_section_children(p, section_id)):
        name = get_section_name(p, c)
        curr_component_name = (
            f"[{idx}]" if section_type_name == C.LIST_ROOT else f'["{name}"]'
        )
        curr_full_name = f"{parent_name}{curr_component_name}"
        set_full_children_names_for_regex(
            p,
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
        p,
        section_id,
        get_selected_item(p, section_id),
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

    if section_type_name == C.SECTION:
        all_names.append(escape_reg_exp(args_full_name))
        full_name_to_info[args_full_name] = {
            "section_id": section_id,
            "param_info_id": None,
            "component_indices": args_parent_lengths,
            "is_args_obj": True,
        }


def set_full_param_regex(
    p,
    section_id,
    code_info_id,
    all_names,
    full_name_to_info,
    parent_name,
    parent_lengths,
    is_global_var=False,
):
    code_info_children = get_code_info_children(p, section_id, code_info_id)
    child_param_infos = [p["codeInfo"][x] for x in code_info_children]

    for param_info in child_param_infos:
        if not param_info["name"] or param_info["rc_type"] != C.PARAMETER:
            continue

        full_name = (
            param_info["name"]
            if is_global_var
            else f'{parent_name}["{param_info["name"]}"]'
        )
        new_lengths_array = parent_lengths + [len(full_name)]
        set_full_param_regex(
            p,
            section_id,
            param_info["id"],
            all_names,
            full_name_to_info,
            full_name,
            new_lengths_array,
        )

        all_names.append(escape_reg_exp(full_name))
        full_name_to_info[full_name] = {
            "section_id": section_id,
            "param_info_id": param_info["id"],
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


def compute_info_to_full_name(full_name_to_info):
    output = {}
    for k, v in full_name_to_info.items():
        output[(v["section_id"], v["param_info_id"], v["is_args_obj"])] = k
    return output


def is_top_level_and_can_be_referred_to(p, section_id, section_type_name):
    return not p["sections"][section_id]["parentId"] and section_type_name in [
        C.GLOBAL_VARIABLES,
        C.SECTION,
        C.LIST_ROOT,
        C.DICT_ROOT,
        C.GROUP,
        C.TEXT_BLOCK,
    ]
