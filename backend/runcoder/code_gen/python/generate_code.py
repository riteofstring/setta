import ast
import copy

from ...utils.constants import C
from ..find_placeholders import double_braces
from ..utils import push_var_deep
from .infer_imports import infer_imports


def get_location_str(node):
    return f"{node.lineno}_{node.col_offset}"


def import_str(x):
    return f"import {x}"


def get_import_text(code):
    imports = [import_str(x) for x in infer_imports(code)]
    return "\n".join(imports)


def get_mappings(var_names, selected, is_dict):
    mappings = [var_declaration(selected[v]["name"], v, is_dict) for v in var_names]
    return ", ".join(mappings)


def get_dict_contents(var_names, selected):
    return get_mappings(var_names, selected, is_dict=True)


def get_callable_params(var_names, selected):
    return get_mappings(var_names, selected, is_dict=False)


def get_boolean(value):
    return "True" if value == "true" else "False"


def var_declaration(var_name, value, is_dict=False):
    if is_dict:
        operator = ":"
        var_name = f'"{var_name}"'
    else:
        operator = "="
    return f"{var_name}{operator}{value}"


def get_value(x, selected):
    type_value = x["type"]
    if type_value in [C.TEXT, C.SLIDER]:
        return str(x["value"])
    elif type_value == C.SWITCH:
        return str(get_boolean(x["value"]))
    elif type_value in [C.SECTION]:
        if not x["value"]["callable"]:
            return "{" + get_dict_contents(x["value"]["params"], selected) + "}"
        else:
            return f"{x['value']['callable']}({get_callable_params(x['value']['params'], selected)})"
    elif type_value == C.LIST_ROOT:
        return f"[{', '.join(map(str, x['value']))}]"
    elif type_value == C.DICT_ROOT:
        return "{" + get_dict_contents(x["value"], selected) + "}"
    else:
        return None


def create_line(var_name, x, selected, force_appear):
    value = get_value(x, selected)
    dec = var_declaration(var_name, value) if value or force_appear else value
    return dec


def generate_lines_of_code_without_imports(
    selected, push_var_name=None, force_appear_var_name=None
):
    selected = copy.deepcopy(selected)
    lines = []
    var_name_to_line_num = {}
    if push_var_name:
        for v in selected.values():
            if (
                isinstance(v["value"], dict)
                and force_appear_var_name in v["value"]["unusedParams"]
            ):
                v["value"]["params"].append(force_appear_var_name)
                v["value"]["unusedParams"].remove(force_appear_var_name)
        selected = [{"var_name": k, **v} for k, v in selected.items()]
        selected = push_var_deep(selected, push_var_name)
        selected = {v.pop("var_name"): v for v in selected}
    for var_name, x in selected.items():
        force_appear = force_appear_var_name == var_name
        var_str = create_line(var_name, x, selected, force_appear=force_appear)
        if var_str:
            var_name_to_line_num[var_name] = len(lines)
            lines.append(var_str)

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


def prepend_with_imports(
    lines,
    templated_code,
    force_appear_var_name,
    var_name_to_line_num,
    replace_templated_code=True,
):
    if force_appear_var_name:
        line_num = var_name_to_line_num[force_appear_var_name]
        original_force_appear_var_str = lines[line_num]
        var_str = original_force_appear_var_str.rstrip(".(")
        try:
            ast.parse(var_str)
        except SyntaxError:
            var_str = var_declaration(force_appear_var_name, "None")
        lines[line_num] = var_str

    code_to_infer = replace_keywords(
        templated_code, {"RUNCODER_GENERATED_CODE": "\n".join(lines)}
    )
    imports = get_import_text(code_to_infer)
    imports = imports + "\n\n"

    if force_appear_var_name:
        lines[line_num] = original_force_appear_var_str

    num_preceding_lines = count_lines(
        templated_code.split(double_braces("RUNCODER_GENERATED_CODE"))[0] + imports
    )
    new_var_name_to_line_num = {
        k: v + num_preceding_lines for k, v in var_name_to_line_num.items()
    }

    generated_code = imports + "\n".join(lines)
    output = (
        replace_keywords(templated_code, {"RUNCODER_GENERATED_CODE": generated_code})
        if replace_templated_code
        else generated_code
    )

    return (
        output,
        new_var_name_to_line_num,
    )


def generate_code(
    selected,
    templated_code,
    push_var_name=None,
    force_appear_var_name=None,
    replace_templated_code=True,
):
    (
        lines,
        var_name_to_line_num,
    ) = generate_lines_of_code_without_imports(
        selected,
        push_var_name=push_var_name,
        force_appear_var_name=force_appear_var_name,
    )

    return prepend_with_imports(
        lines,
        templated_code,
        force_appear_var_name,
        var_name_to_line_num,
        replace_templated_code,
    )


def replace_keywords(x, replacements):
    for key, value in replacements.items():
        x = x.replace(double_braces(key), value)
    return x


def get_line_from_string(input_string, line_number):
    lines = input_string.split("\n")
    return lines[line_number]


def append_to_line(input_string, line_number, append):
    lines = input_string.split("\n")
    lines[line_number] += append
    return "\n".join(lines)
