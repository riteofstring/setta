from dataclasses import dataclass
from typing import Optional

from ...utils.constants import C, ParameterPassingStyle

SELF_IDENTIFIER = "s"


S_CLASS = f"""
import torch
from setta.code_gen.python.args_obj import SettaArgsObj

class S:
    def __init__({SELF_IDENTIFIER}):
        {SELF_IDENTIFIER}.args = SettaArgsObj()
""".lstrip()


@dataclass
class PythonCodeLine:
    var_str: str
    prefix_len: int
    value_len: int
    pos: Optional[int] = None

    @property
    def value_position(self):
        """Returns a tuple of (value_pos_start, value_pos_end)"""
        if self.pos is None:
            return None
        value_pos_start = self.pos + self.prefix_len
        value_pos_end = value_pos_start + self.value_len
        return (value_pos_start, value_pos_end)


class PythonCodeGenerator:
    def __init__(self, lsp_writers):
        self.lsp_writer = lsp_writers.full

    def generate_code(self, exporter_output, force_appear_key=None):
        lines = {}
        for key, details in exporter_output.items():
            force_appear = force_appear_key == key
            var_str, prefix_len, value_len = create_line(
                details, exporter_output, force_appear=force_appear
            )
            if var_str:
                lines[key] = PythonCodeLine(var_str, prefix_len, value_len)

        code = self.generate_wrapper_class(lines)
        return code, lines

    def generate_wrapper_class(self, lines):
        code = S_CLASS
        indent = "        "
        indent_len = len(indent)
        for key, l in lines.items():
            curr_pos = len(code) + indent_len
            code = f"{code}{indent}{l.var_str}\n"
            lines[key].pos = curr_pos
        return code


def get_mappings(dependency_keys, exporter_output, is_dict=False, passingStyles=None):
    if passingStyles is None:
        passingStyles = {}
    output = ""
    curr_position = 0
    for idx, key in enumerate(dependency_keys):
        v = exporter_output[key]["var_name"]
        prefix = "" if idx == 0 else ", "
        if passingStyles.get(key) == ParameterPassingStyle.ARGS:
            prefix = "*"
        elif passingStyles.get(key) == ParameterPassingStyle.KWARGS:
            prefix = "**"
        elif is_dict or (
            passingStyles.get(key) == ParameterPassingStyle.DEFAULT
            or passingStyles.get(key) == ParameterPassingStyle.KEYWORD_ONLY
        ):
            var_decl_prefix = var_declaration(
                exporter_output[key]["name"],
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


def get_dict_contents(dependency_keys, exporter_output):
    return get_mappings(dependency_keys, exporter_output, is_dict=True)


def get_callable_params(dependency_keys, passingStyles, exporter_output):
    return get_mappings(dependency_keys, exporter_output, passingStyles=passingStyles)


def get_list_of_vars(dependency_keys, exporter_output):
    return get_mappings(dependency_keys, exporter_output)


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
def get_value(x, exporter_output):
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
            output = get_dict_contents(x["value"]["usedParams"], exporter_output)
            prefix = "{"
            output = prefix + output + "}"
        else:
            output = get_callable_params(
                x["value"]["usedParams"], x["value"]["passingStyles"], exporter_output
            )
            prefix = f"{x['value']['callable']}("
            output = f"{prefix}{output})"
    elif type_value == C.LIST_ROOT:
        output = get_list_of_vars(x["value"], exporter_output)
        output = f"[{output}]"
    elif type_value in [C.DICT_ROOT, C.GROUP, C.NESTED_PARAM]:
        output = get_dict_contents(x["value"], exporter_output)
        output = "{" + output + "}"
    else:
        output = None

    return output


def create_line(details, exporter_output, force_appear):
    value = get_value(details, exporter_output)
    if value or force_appear:
        var_name = details["var_name"]
        if details["isTopLevel"]:
            var_name = f"{SELF_IDENTIFIER}.{var_name}"
        prefix = var_declaration(var_name, value, return_prefix=True)
        final_str = f"{prefix}{value}"
        return final_str, len(prefix), len(value)
    return None, None, None
