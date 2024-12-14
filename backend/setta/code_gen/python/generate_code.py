import ast
import copy
from weakref import ref

from ...utils.constants import USER_SETTINGS, C
from ..find_placeholders import double_braces
from ..utils import push_var_deep
from .infer_imports import find_missing_imports
import re


def get_location_str(node):
    return f"{node.lineno}_{node.col_offset}"


def import_str(x):
    return f"import {x}"


def get_import_text(code):
    imports = [import_str(x) for x in find_missing_imports(code)]
    return "\n".join(imports)


def get_mappings(var_names, selected, is_dict, positionalOnlyParams=None):
    mappings = [
        v
        if not is_dict and v in positionalOnlyParams
        else var_declaration(selected[v]["name"], v, is_dict)
        for v in var_names
    ]
    return ", ".join(mappings)


def get_dict_contents(var_names, selected):
    return get_mappings(var_names, selected, is_dict=True)


def get_callable_params(var_names, positionalOnlyParams, selected):
    return get_mappings(
        var_names, selected, is_dict=False, positionalOnlyParams=positionalOnlyParams
    )


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
            return "{" + get_dict_contents(x["dependencies"], selected) + "}"
        else:
            return f"{x['value']['callable']}({get_callable_params(x['dependencies'], x['value']['positionalOnlyParams'], selected)})"
    elif type_value == C.LIST_ROOT:
        return f"[{', '.join(map(str, x['value']))}]"
    elif type_value in [C.DICT_ROOT, C.GROUP, C.NESTED_PARAM]:
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
                v["dependencies"].append(force_appear_var_name)
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


def maybe_prepend_with_imports_and_replace_templated_code(
    lines,
    templated_code,
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

        to_infer_imports_from = replace_keywords(
            templated_code, {C.SETTA_GENERATED_PYTHON: "\n".join(lines)}
        )
        imports = get_import_text(to_infer_imports_from)
        imports = imports + "\n\n"

        if force_appear_var_name:
            lines[line_num] = original_force_appear_var_str
    else:
        imports = ""

    num_preceding_lines = count_lines(
        templated_code.split(double_braces(C.SETTA_GENERATED_PYTHON))[0] + imports
    )
    new_var_name_to_line_num = {
        k: v + num_preceding_lines for k, v in var_name_to_line_num.items()
    }

    generated_code = imports + "\n".join(lines)
    output = (
        replace_keywords(templated_code, {C.SETTA_GENERATED_PYTHON: generated_code})
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

    return maybe_prepend_with_imports_and_replace_templated_code(
        lines,
        templated_code,
        force_appear_var_name,
        var_name_to_line_num,
        replace_templated_code,
    )

from pprint import pprint
def convert_var_names_to_readable_form(
    generated_code, var_name_to_line_num, exporter_obj, code_area_ref_var_name_positions
):
    print(generated_code, flush=True)
    print(var_name_to_line_num, flush=True)
    # pprint(exporter_obj.output)
    for p,v in code_area_ref_var_name_positions:
        print(generated_code[p:p+len(v)], flush=True)

    return generated_code



def replace_keywords(x, replacements, ref_var_name_positions=None):
    for key, new_value in replacements.items():
        if new_value is not None:
            old_value = double_braces(key)
            if ref_var_name_positions:
                print("finding matches using re", old_value, x, flush=True)
                for match in re.finditer(re.escape(old_value), x):
                    position = match.start()
                    print("position", flush=True)
                    for idx in range(len(ref_var_name_positions)):
                        p, v = ref_var_name_positions[idx]
                        if position < p:
                            p += len(new_value) - len(old_value)
                            print("new p", p, flush=True)
                            ref_var_name_positions[idx] = p, v

            x = x.replace(old_value, new_value)
    return x


def get_line_from_string(input_string, line_number):
    lines = input_string.split("\n")
    return lines[line_number]


def append_to_line(input_string, line_number, append):
    lines = input_string.split("\n")
    lines[line_number] += append
    return "\n".join(lines)


def find_line_number(code, search_term):
    lines = code.split("\n")
    for i, line in enumerate(lines):
        if search_term in line:
            return i
    return -1


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
