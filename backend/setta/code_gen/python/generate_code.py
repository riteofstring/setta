from setta.code_gen.python.make_parseable import make_parseable

from ...utils.constants import C, ParameterPassingStyle
from ..utils import push_var_deep
from .ast_utils import find_missing_imports

SELF_IDENTIFIER = "s"


def get_import_text(code):
    imports = [f"import {x}" for x in find_missing_imports(code)]
    return "\n".join(imports)


def get_mappings(var_names, selected, is_dict=False, passingStyles=None):
    if passingStyles is None:
        passingStyles = {}
    output = ""
    curr_position = 0
    for idx, v in enumerate(var_names):
        prefix = "" if idx == 0 else ", "
        if passingStyles.get(v) == ParameterPassingStyle.ARGS:
            prefix = "*"
        elif passingStyles.get(v) == ParameterPassingStyle.KWARGS:
            prefix = "**"
        elif is_dict or (
            passingStyles.get(v) == ParameterPassingStyle.DEFAULT
            or passingStyles.get(v) == ParameterPassingStyle.KEYWORD_ONLY
        ):
            var_decl_prefix = var_declaration(
                selected[v]["name"],
                v,
                is_dict,
                return_prefix=True,
                is_callable_param=True,
            )
            prefix += var_decl_prefix

        curr_output = f"{prefix}{v}"
        curr_position += len(curr_output)
        output += curr_output

    return output


def get_dict_contents(var_names, selected):
    return get_mappings(var_names, selected, is_dict=True)


def get_callable_params(var_names, passingStyles, selected):
    return get_mappings(var_names, selected, passingStyles=passingStyles)


def get_list_of_vars(var_names):
    return get_mappings(var_names, None)


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


# TODO: remove str(x["value"]). I don't think it's necessary since x["value"] should always be a string already.
def get_value(x, selected):
    type_value = x["type"]
    if (
        type_value == C.TEXT
        or type_value == C.SLIDER
        or type_value == C.DROPDOWN
        or type_value == C.PASSWORD
    ):
        output = str(x["value"])
    elif type_value == C.SWITCH:
        output = str(get_boolean(x["value"]))
    elif type_value == C.COLOR_PICKER:
        output = f'"{x["value"]}"'
    elif type_value == C.TEXT_BLOCK:
        output = f'"""{x["value"]}"""'
    elif type_value == C.SECTION:
        if not x["value"]["callable"]:
            output = get_dict_contents(x["value"]["usedParams"], selected)
            prefix = "{"
            output = prefix + output + "}"
        else:
            output = get_callable_params(
                x["value"]["usedParams"], x["value"]["passingStyles"], selected
            )
            prefix = f"{x['value']['callable']}("
            output = f"{prefix}{output})"
    elif type_value == C.LIST_ROOT:
        output = get_list_of_vars(x["value"])
        output = f"[{output}]"
    elif type_value in [C.DICT_ROOT, C.GROUP, C.NESTED_PARAM]:
        output = get_dict_contents(x["value"], selected)
        output = "{" + output + "}"
    else:
        output = None

    return output


def create_line(var_name, x, selected, force_appear):
    value = get_value(x, selected)
    if value or force_appear:
        prefix = var_declaration(var_name, value, return_prefix=True)
        value = f"{prefix}{value}"
        if x["isTopLevel"]:
            value = f"{SELF_IDENTIFIER}.{value}"
    return value


def generate_code(selected, push_var_name=None):
    lines = []
    if push_var_name:
        # TODO: rethink this push_var logic
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
        var_str = create_line(var_name, x, selected, force_appear=force_appear)
        lines.append(var_str)

    code = generate_wrapper_class(lines)
    return code


def generate_imports(
    code,
    push_var_name,
    var_name_to_decl_position,
):
    if push_var_name:
        startPos, var_decl, chars_after_line = var_name_to_decl_position[push_var_name]
        endPos = startPos + len(var_decl)
        parseable_str = make_parseable(code[startPos:endPos], push_var_name)
        if parseable_str is None:
            parseable_str = var_declaration(push_var_name, "None")
        var_decl = construct_var_decl_with_trailing_whitespace(
            parseable_str, chars_after_line
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


def generate_wrapper_class(lines):
    code = f"""
from setta.code_gen.python.args_obj import SettaArgsObj

class S:
    def __init__({SELF_IDENTIFIER}):
        {SELF_IDENTIFIER}.args = SettaArgsObj()
"""

    for l in lines:
        code = f"{code}        {l}\n"
    return code.lstrip()
