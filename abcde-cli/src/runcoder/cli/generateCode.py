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


def get_import_text(x):
    split_name = x.split(".")
    if len(split_name) > 1:
        split_name.pop()
    module_name = ".".join(split_name)
    return f"import {module_name}"


def get_import(x):
    if x["type"] == SECTION:
        if not x["value"]["callable"]:
            return None
        return get_import_text(x["value"]["callable"])
    return None


def get_mappings(var_names, selected, operator):
    mappings = [var_declaration(selected[v]["name"], v, operator) for v in var_names]
    return ", ".join(mappings)


def get_dict_contents(var_names, selected):
    return get_mappings(var_names, selected, ":")


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
    imports = set()
    for var_name, x in selected.items():
        var_str = create_line(var_name, x, selected)
        if var_str:
            lines.append(var_str)
        import_str = get_import(x)
        if import_str:
            imports.add(import_str)
    final_array = list(imports) + ["\n"] + lines
    return "\n".join(final_array)
