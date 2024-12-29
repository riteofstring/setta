import ast
import copy

from setta.utils.utils import replace_at_positions

from ...utils.constants import USER_SETTINGS, C
from ..utils import push_var_deep
from .ast_utils import find_missing_imports, find_top_level_symbols


def get_location_str(node):
    return f"{node.lineno}_{node.col_offset}"


def import_str(x):
    return f"import {x}"


def get_import_text(code):
    imports = [import_str(x) for x in find_missing_imports(code)]
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


def generate_lines_of_code_without_imports(
    selected, push_var_name=None, force_appear_var_name=None, make_copy_of_selected=True
):
    if make_copy_of_selected:
        selected = copy.deepcopy(selected)
    lines = []
    var_name_to_line_num = {}
    if push_var_name:
        for v in selected.values():
            if (
                isinstance(v["value"], dict)
                and force_appear_var_name in v["value"]["unusedParams"]
            ):
                v["value"]["usedParams"].append(force_appear_var_name)
                v["dependencies"].append(force_appear_var_name)
                v["value"]["unusedParams"].remove(force_appear_var_name)
        selected = [{"var_name": k, **v} for k, v in selected.items()]
        selected = push_var_deep(selected, push_var_name)
        selected = {v.pop("var_name"): v for v in selected}
    for var_name, x in selected.items():
        force_appear = force_appear_var_name == var_name
        var_str, ref_var_name_positions = create_line(
            var_name, x, selected, force_appear=force_appear
        )
        if var_str:
            var_name_to_line_num[var_name] = len(lines)
            lines.append(var_str)
            x["ref_var_name_positions"] = ref_var_name_positions

    return lines, var_name_to_line_num


def set_line(lines, var_name_to_line_num, var_name, value):
    line_num = var_name_to_line_num[var_name]
    lines[line_num] = var_declaration(var_name, value)


def count_lines(string):
    if not string:  # Check if the string is empty
        return 0
    line_count = string.count("\n")
    if string.endswith("\n"):
        line_count -= 1
    return line_count + 1  # Adjusting for the last line


def maybe_prepend_with_imports_and_replace_templated_code(
    lines,
    code,
    template_var,
    force_appear_var_name,
    var_name_to_line_num,
    replace_templated_code=True,
):
    if USER_SETTINGS["backend"]["inferImports"]:
        if force_appear_var_name:
            line_num = var_name_to_line_num[force_appear_var_name]
            original_force_appear_var_str = lines[line_num]
            var_str = original_force_appear_var_str.rstrip(".(")
            try:
                ast.parse(var_str)
            except SyntaxError:
                var_str = var_declaration(force_appear_var_name, "None")
            lines[line_num] = var_str

        to_infer_imports_from = replace_gen_code_template_var(
            code,
            template_var,
            "\n".join(lines),
        )
        imports = get_import_text(to_infer_imports_from)
        imports = imports + "\n\n"

        if force_appear_var_name:
            lines[line_num] = original_force_appear_var_str
    else:
        imports = ""

    num_preceding_lines = count_lines(imports + code[: template_var["startPos"]])
    new_var_name_to_line_num = {
        k: v + num_preceding_lines for k, v in var_name_to_line_num.items()
    }

    generated_code = imports + "\n".join(lines)
    output = (
        replace_gen_code_template_var(code, template_var, generated_code)
        if replace_templated_code
        else generated_code
    )

    return (
        output,
        new_var_name_to_line_num,
    )


def generate_code(
    selected,
    code,
    template_var,
    push_var_name=None,
    force_appear_var_name=None,
    replace_templated_code=True,
    make_copy_of_selected=True,
):
    (
        lines,
        var_name_to_line_num,
    ) = generate_lines_of_code_without_imports(
        selected,
        push_var_name=push_var_name,
        force_appear_var_name=force_appear_var_name,
        make_copy_of_selected=make_copy_of_selected,
    )

    return maybe_prepend_with_imports_and_replace_templated_code(
        lines,
        code,
        template_var,
        force_appear_var_name,
        var_name_to_line_num,
        replace_templated_code,
    )


def convert_var_names_to_readable_form(
    generated_code,
    var_name_to_line_num,
    exporter_obj,
    code_area_ref_var_name_positions,
    setup_code,
):
    # need to adjust line numbers and positions with prepended setup code length
    # because the setup code has been prepended to the generated code
    # after the line numbers and positions are calculated.
    setup_code_len = len(setup_code)
    setup_code_num_lines = count_lines(setup_code)

    all_ref_var_name_positions = [
        (p + setup_code_len, v) for p, v in code_area_ref_var_name_positions
    ]

    # convert to global positions
    for var_name, line_num in var_name_to_line_num.items():
        line_num += setup_code_num_lines
        details = exporter_obj.output[var_name]
        line_col_pairs = [
            (line_num, col) for col, _ in details["ref_var_name_positions"]
        ]
        line_col_pairs.append((line_num, 0))  # this is for the variable declaration
        global_positions = line_col_to_position_batch(generated_code, line_col_pairs)
        variable_declaration_position = (
            global_positions.pop()
        )  # need to pop this before we zip with ref_var_name_positions
        ref_var_name_global_positions = [
            (p, v[1])
            for p, v in zip(global_positions, details["ref_var_name_positions"])
        ]
        all_ref_var_name_positions.extend(ref_var_name_global_positions)
        all_ref_var_name_positions.append((variable_declaration_position, var_name))

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


def get_line_from_string(input_string, line_number):
    lines = input_string.split("\n")
    return lines[line_number]


def append_to_line(input_string, line_number, append):
    lines = input_string.split("\n")
    lines[line_number] += append
    return "\n".join(lines)


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


def replace_gen_code_template_var(code, templateVar, gen_code):
    return replace_at_positions(
        code,
        [
            (
                templateVar["startPos"],
                templateVar["keyword"],
                gen_code,
            )
        ],
    )


def replace_at_positions_and_update_ref_var_name_positions(
    code, replacements, ref_var_name_positions
):
    def callback(old_pos, shift):
        for i, (pos, value) in enumerate(ref_var_name_positions):
            if pos >= old_pos:
                ref_var_name_positions[i] = (pos + shift, value)

    return replace_at_positions(code, replacements, callback=callback)
