from setta.code_gen.python.make_parseable import make_parseable, maybe_add_newline
from setta.utils.utils import replace_at_positions

from ...utils.constants import USER_SETTINGS, C
from ..utils import push_var_deep
from .ast_utils import find_missing_imports, find_top_level_symbols


def get_import_text(code):
    imports = [f"import {x}" for x in find_missing_imports(code)]
    return "\n".join(imports)


def get_mappings(var_names, selected, is_dict, positionalOnlyParams=None):
    output = ""
    relative_positions = []
    curr_position = 0
    for idx, v in enumerate(var_names):
        prefix = "" if idx == 0 else ", "
        if is_dict or v not in positionalOnlyParams:
            var_decl_prefix = var_declaration(
                selected[v]["name"],
                v,
                is_dict,
                return_prefix=True,
                is_callable_param=True,
            )
            prefix += var_decl_prefix

        curr_output = f"{prefix}{v}"
        relative_positions.append((curr_position + len(prefix), v))
        curr_position += len(curr_output)
        output += curr_output

    return output, relative_positions


def get_dict_contents(var_names, selected):
    return get_mappings(var_names, selected, is_dict=True)


def get_callable_params(var_names, positionalOnlyParams, selected):
    return get_mappings(
        var_names, selected, is_dict=False, positionalOnlyParams=positionalOnlyParams
    )


def get_list_of_vars(var_names):
    return get_mappings(var_names, None, is_dict=False, positionalOnlyParams=var_names)


def get_boolean(value):
    return "True" if value == "true" else "False"


def var_declaration(
    var_name, value, is_dict=False, return_prefix=False, is_callable_param=False
):
    if is_dict:
        prefix = f'"{var_name}": '
    else:
        prefix = f"{var_name}=" if is_callable_param else f"{var_name} = "
    if return_prefix:
        return prefix
    return f"{prefix}{value}"


# returns the value and a relative_positions array (for populating some ref_var_name_positions) or None if not applicable
def get_value(x, selected):
    type_value = x["type"]
    if type_value == C.TEXT:
        output = str(x["value"])
        relative_positions = []
    elif type_value == C.SLIDER:
        output = str(x["value"])
        relative_positions = []
    elif type_value == C.SWITCH:
        output = str(get_boolean(x["value"]))
        relative_positions = []
    elif type_value == C.SECTION:
        if not x["value"]["callable"]:
            output, relative_positions = get_dict_contents(
                x["value"]["usedParams"], selected
            )
            prefix = "{"
            output = prefix + output + "}"
            prefix_len = len(prefix)
        else:
            output, relative_positions = get_callable_params(
                x["value"]["usedParams"], x["value"]["positionalOnlyParams"], selected
            )
            prefix = f"{x['value']['callable']}("
            output = f"{prefix}{output})"
            prefix_len = len(prefix)
        relative_positions = [(p + prefix_len, v) for p, v in relative_positions]
    elif type_value == C.LIST_ROOT:
        output, relative_positions = get_list_of_vars(x["value"])
        output = f"[{output}]"
        relative_positions = [(p + 1, v) for p, v in relative_positions]
    elif type_value in [C.DICT_ROOT, C.GROUP, C.NESTED_PARAM]:
        output, relative_positions = get_dict_contents(x["value"], selected)
        output = "{" + output + "}"
        relative_positions = [(p + 1, v) for p, v in relative_positions]
    else:
        output = None
        relative_positions = []

    return output, relative_positions


def create_line(var_name, x, selected, force_appear):
    value, relative_positions = get_value(x, selected)
    # include any ref positions that were calculated in export_selected,
    # because they too need to be shifted by the length of the variable declaration
    relative_positions.extend(x["ref_var_name_positions"])
    if value or force_appear:
        prefix = var_declaration(var_name, value, return_prefix=True)
        prefix_len = len(prefix)
        value = f"{prefix}{value}"
        relative_positions = [(p + prefix_len, v) for p, v in relative_positions]
    return value, relative_positions


def generate_code(selected, push_var_name=None):
    code = ""
    var_name_to_decl_position = {}
    if push_var_name:
        for v in selected.values():
            if (
                isinstance(v["value"], dict)
                and push_var_name in v["value"]["unusedParams"]
            ):
                v["value"]["usedParams"].append(push_var_name)
                v["dependencies"].append(push_var_name)
                v["value"]["unusedParams"].remove(push_var_name)
        selected = [{"var_name": k, **v} for k, v in selected.items()]
        selected = push_var_deep(selected, push_var_name)
        selected = {v.pop("var_name"): v for v in selected}
    for var_name, x in selected.items():
        force_appear = push_var_name == var_name
        var_str, ref_var_name_positions = create_line(
            var_name, x, selected, force_appear=force_appear
        )
        if var_str:
            var_str = f"{var_str}\n"
            startPos = len(code)
            var_name_to_decl_position[var_name] = startPos, var_str
            code += var_str
            x["ref_var_name_positions"] = ref_var_name_positions

    return code, var_name_to_decl_position


def generate_imports(code, push_var_name, var_name_to_decl_position, template_var):
    if push_var_name:
        startPos, var_decl = var_name_to_decl_position[push_var_name]
        endPos = startPos + len(var_decl)
        var_decl = maybe_add_newline(
            make_parseable(code[startPos:endPos], push_var_name)
        )
        code = code[:startPos] + var_decl + code[endPos:]

    startPos = template_var["startPos"]
    endPos = startPos + len(template_var["keyword"])
    # remove template var to infer imports, because ast will raise syntax error
    code = code[:startPos] + code[endPos:]
    imports = get_import_text(code)
    if len(imports) > 0:
        imports += "\n"
    return imports


def convert_var_names_to_readable_form(
    generated_code,
    var_name_to_decl_position,
    exporter_obj,
    code_area_ref_var_name_positions,
    setup_code,
):
    # need to adjust line numbers and positions with prepended setup code length
    # because the setup code has been prepended to the generated code
    # after the line numbers and positions are calculated.
    setup_code_len = len(setup_code)

    all_ref_var_name_positions = [
        (p + setup_code_len, v) for _, p, v in code_area_ref_var_name_positions
    ]

    # convert to global positions
    for var_name, (startPos, _) in var_name_to_decl_position.items():
        newStartPos = startPos + setup_code_len
        all_ref_var_name_positions.append((newStartPos, var_name))
        for col, v in exporter_obj.output[var_name]["ref_var_name_positions"]:
            all_ref_var_name_positions.append((newStartPos + col, v))

    # create nice var names for references
    top_level_symbols = find_top_level_symbols(generated_code)
    var_name_to_nice_var_name_mapping = {}
    for idx in range(len(all_ref_var_name_positions)):
        position, var_name = all_ref_var_name_positions[idx]

        # only create nice_var_name if we haven't already created it for this var_name
        if var_name not in var_name_to_nice_var_name_mapping:
            nice_name = exporter_obj.output[var_name]["name"]
            nice_var_name = create_nice_var_name(top_level_symbols, nice_name)
            top_level_symbols.add(nice_var_name)
            var_name_to_nice_var_name_mapping[var_name] = nice_var_name

        nice_var_name = var_name_to_nice_var_name_mapping[var_name]
        all_ref_var_name_positions[idx] = position, var_name, nice_var_name

    generated_code = replace_at_positions(generated_code, all_ref_var_name_positions)
    return generated_code


def create_nice_var_name(top_level_symbols, nice_name):
    trial_name = nice_name
    counter = 2
    while trial_name in top_level_symbols:
        trial_name = f"{nice_name}_{counter}"
        counter += 1
    return trial_name


def position_to_line_col(text, position):
    if position < 0 or position > len(text):
        return None

    lines = text.split("\n")
    current_pos = 0

    for line_num, line in enumerate(lines):
        line_length = len(line) + 1  # +1 for the newline character
        if current_pos + line_length > position:
            col = position - current_pos
            return line_num, col
        current_pos += line_length

    # If we get here, the position is at the very end of the text
    return len(lines) - 1, len(lines[-1])


def line_col_to_position_batch(text, line_col_pairs):
    lines = text.split("\n")
    line_starts = [0]
    for line in lines[:-1]:
        line_starts.append(line_starts[-1] + len(line) + 1)

    results = []
    for line, col in line_col_pairs:
        if line < 0 or line >= len(lines) or col < 0:
            results.append(None)
        else:
            position = line_starts[line] + min(col, len(lines[line]))
            results.append(position)

    return results
