import ast
import builtins
import copy
from collections import defaultdict

from ..utils.constants import DICT_ROOT, LIST_ROOT, SECTION, SLIDER, SWITCH, TEXT
from .export_selected import get_code, get_script
from .utils import push_var_deep


def get_location_str(node):
    return f"{node.lineno}_{node.col_offset}"


def infer_imports(code_str):
    tree = ast.parse(code_str)
    assigned_vars = set()
    imports = defaultdict(list)

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    assigned_vars.add(target.id)

        elif (
            isinstance(node, ast.Name)
            and node.id not in assigned_vars
            and node.id not in dir(builtins)
        ):
            imports[get_location_str(node)].append(node.id)

        elif isinstance(node, ast.Attribute):
            names = []
            current_node = node
            while isinstance(current_node, ast.Attribute):
                names.append(current_node.attr)
                current_node = current_node.value

            if (
                isinstance(current_node, ast.Name)
                and current_node.id not in assigned_vars
                and current_node.id not in dir(builtins)
            ):
                names.append(current_node.id)
                names.reverse()
                imports[get_location_str(node)].append(".".join(names))

    final_imports = set()
    for candidates in imports.values():
        if len(candidates) == 1:
            final_imports.add(candidates[0])
        else:
            final_imports.add(candidates[1])

    return final_imports


def import_str(x):
    return f"import {x}"


def get_import_text(code):
    imports = [import_str(x) for x in infer_imports(code)]
    return "\n".join(imports), len(imports)


def get_mappings(var_names, selected, operator):
    mappings = [var_declaration(selected[v]["name"], v, operator) for v in var_names]
    return ", ".join(mappings)


def get_dict_contents(var_names, selected):
    return get_mappings([f"{v}" for v in var_names], selected, ":")


def get_callable_params(var_names, selected):
    return get_mappings(var_names, selected, "=")


def get_boolean(value):
    return "True" if value else "False"


def var_declaration(var_name, value, operator="="):
    return f"{var_name}{operator}{value}"


def get_value(x, selected):
    type_value = x["type"]
    if type_value in [TEXT, SLIDER]:  # , REF]:
        return str(x["value"])
    elif type_value == SWITCH:
        return str(get_boolean(x["value"]))
    elif type_value in [SECTION]:  # , FN]:
        if not x["value"]["callable"]:
            return "{" + get_dict_contents(x["value"]["params"], selected) + "}"
        else:
            return f"{x['value']['callable']}({get_callable_params(x['value']['params'], selected)})"
    elif type_value == LIST_ROOT:
        return f"[{', '.join(map(str, x['value']))}]"
    elif type_value == DICT_ROOT:
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


def prepend_with_imports(lines, force_appear_var_name, var_name_to_line_num):
    if force_appear_var_name:
        line_num = var_name_to_line_num[force_appear_var_name]
        original_force_appear_var_str = lines[line_num]
        var_str = original_force_appear_var_str.rstrip(".")
        try:
            ast.parse(original_force_appear_var_str)
        except SyntaxError:
            var_str = var_declaration(force_appear_var_name, "None")
        lines[line_num] = var_str

    imports, num_imports = get_import_text("\n".join(lines))

    if force_appear_var_name:
        lines[line_num] = original_force_appear_var_str

    new_var_name_to_line_num = {
        k: v + num_imports + 1 for k, v in var_name_to_line_num.items()
    }
    return imports + "\n\n" + "\n".join(lines), new_var_name_to_line_num


def generate_code_and_prepend_imports(
    selected, push_var_name=None, force_appear_var_name=None
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
        force_appear_var_name,
        var_name_to_line_num,
    )


def double_braces(x):
    return f"{{{{ {x} }}}}"


def replace_keywords(x, replacements):
    for key, value in replacements.items():
        x = x.replace(double_braces(key), value)
    return x


def generate_script(p, py_filepath):
    script = get_script(p)
    if script in [None, ""]:
        script = f"python {py_filepath}"
    return replace_keywords(script, {"RUNCODER_PYTHON_FILE": py_filepath})


def generate_code(selected, p, push_var_name=None, force_appear_var_name=None):
    x, _ = generate_code_and_prepend_imports(
        selected, push_var_name, force_appear_var_name
    )
    code = get_code(p)
    if code in [None, ""]:
        return x
    return replace_keywords(code, {"RUNCODER_GENERATED_CODE": x})
