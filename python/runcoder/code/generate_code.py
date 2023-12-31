import ast
import builtins
from collections import defaultdict

from ..utils.constants import (
    DICT_ROOT,
    FN,
    LIST_ROOT,
    REF,
    SECTION,
    SLIDER,
    SWITCH,
    TEXT,
)


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
    return "\n".join([import_str(x) for x in infer_imports(code)])


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
    if type_value in [TEXT, SLIDER, REF]:
        return str(x["value"])
    elif type_value == SWITCH:
        return str(get_boolean(x["value"]))
    elif type_value in [SECTION, FN]:
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


def create_line(var_name, x, selected):
    value = get_value(x, selected)
    return var_declaration(var_name, value) if value else value


def generate_code(selected):
    lines = []
    for var_name, x in selected.items():
        var_str = create_line(var_name, x, selected)
        if var_str:
            lines.append(var_str)

    code = "\n".join(lines)
    imports = get_import_text(code)
    return imports + "\n\n" + code
