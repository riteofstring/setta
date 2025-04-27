import re

from setta.code_gen.find_placeholders import tp
from setta.utils.constants import C


# input is state computed by keyword regex subscription
def get_template_vars_regex_and_color_map(state):
    names = [C.SETTA_GENERATED_PYTHON, C.SETTA_GENERATED_PYTHON_IMPORTS]
    full_raw_name_to_section_id = {}
    for n in names:
        full_raw_name_to_section_id[n] = None

    section_state = use_section_infos.get_state()
    # TODO: make this better instead of 3 for loops
    for section_id, suffixes in state["template_var_eligible_sections"].items():
        section_full_name = get_section_path_full_name(section_id, section_state)
        for suffix in suffixes:
            full_name = section_full_name + tp(suffix)
            names.append(escape_reg_exp(full_name))
            full_raw_name_to_section_id[full_name] = section_id

    full_name_to_section_id = map_keys(full_raw_name_to_section_id, lambda v, k: tp(k))

    if len(names) == 0:
        return {
            "pattern": dummy_reg_exp_object(),
            "full_name_to_section_id": full_name_to_section_id,
        }

    pattern_str = (
        f"(?<![A-Za-z.\"'_])\\{C.TEMPLATE_PREFIX}({('|').join(names)})(?![A-Za-z\"'_])"
    )
    pattern = re.compile(pattern_str, re.MULTILINE)

    return {"pattern": pattern, "full_name_to_section_id": full_name_to_section_id}


def construct_template_vars(keyword_positions, full_text):
    output = []
    full_name_to_section_id = use_template_var_regex.get_state()[
        "full_name_to_section_id"
    ]

    for k in keyword_positions:
        keyword = full_text[k.start_pos : k.end_pos]
        if keyword in full_name_to_section_id:
            output.append(
                {
                    "section_id": full_name_to_section_id[keyword],
                    "start_pos": k.start_pos,
                    "keyword": keyword,
                }
            )

    return output
