import asyncio
from dataclasses import dataclass
from typing import Optional

from setta.database.utils import create_new_id

from ...utils.constants import C, ParameterPassingStyle
from .ast_utils import find_missing_imports

SELF_IDENTIFIER = "s"


S_CLASS = f"""
from setta.code_gen.python.args_obj import SettaArgsObj

class S:
    def __init__({SELF_IDENTIFIER}):
        {SELF_IDENTIFIER}.args = SettaArgsObj()
"""


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
    def __init__(self, lsp_writers, temp_folder):
        self.lsp_writer = lsp_writers.full
        self.virtual_filepath_for_import_validator = temp_folder / "validate_imports.py"

    async def generate_code(self, exporter_output, force_appear_key=None):
        lines = {}
        for key, details in exporter_output.items():
            force_appear = force_appear_key == key
            var_str, prefix_len, value_len = create_line(
                details, exporter_output, force_appear=force_appear
            )
            if var_str:
                lines[key] = PythonCodeLine(var_str, prefix_len, value_len)

        code = self.generate_wrapper_class(lines)
        # imports = generate_imports(code)
        # imports = await self.validate_imports(imports)
        # code = f"{imports}{code}"
        return code, lines

    def generate_wrapper_class(self, lines):
        code = S_CLASS.lstrip()
        indent = "        "
        indent_len = len(indent)
        for key, l in lines.items():
            curr_pos = len(code) + indent_len
            code = f"{code}{indent}{l.var_str}\n"
            lines[key].pos = curr_pos
        return code

    async def validate_imports(self, generated_imports):
        if not generated_imports:
            return generated_imports

        filepath = self.virtual_filepath_for_import_validator
        virtual = True
        await self.lsp_writer.send_document_open_request(
            filepath=filepath, code=generated_imports, virtual=virtual
        )

        lines = generated_imports.split("\n")
        message_id = create_new_id()

        # First, send all requests and store the futures
        request_futures = []
        line_indices = []  # Keep track of which line each request is for
        for idx, line in enumerate(lines):
            if not line:
                continue
            request_id = f"{message_id}-{idx}"
            # Send request without awaiting
            self.lsp_writer.create_asyncio_task(
                self.lsp_writer.send_definition_request(
                    idx, len(line) - 1, filepath, request_id, virtual=virtual
                ),
                request_id,
                local=True,
            )
            # Store the future for waiting later
            future = self.lsp_writer.wait_for_response(request_id)
            request_futures.append(future)
            line_indices.append(idx)  # Store the original line index

        # Then await all responses concurrently
        responses = await asyncio.gather(*request_futures)

        # Use line_indices to map responses back to correct lines
        for response_idx, response in enumerate(responses):
            original_idx = line_indices[response_idx]
            if not response["result"]:
                # replace with equal length comment so that we don't have
                # to change any position information
                lines[original_idx] = "#" * len(lines[original_idx])

        generated_imports = "\n".join(lines)
        return generated_imports


def get_import_text(code):
    imports = [f"import {x}" for x in find_missing_imports(code)]
    return "\n".join(imports)


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


def generate_imports(
    code,
):
    # if push_var_name:
    #     startPos, var_decl, chars_after_line = var_name_to_decl_position[push_var_name]
    #     endPos = startPos + len(var_decl)
    #     parseable_str = make_parseable(code[startPos:endPos], push_var_name)
    #     if parseable_str is None:
    #         parseable_str = var_declaration(push_var_name, "None")
    #     var_decl = construct_var_decl_with_trailing_whitespace(
    #         parseable_str, chars_after_line
    #     )
    #     code = code[:startPos] + var_decl + code[endPos:]
    imports = get_import_text(code)
    if len(imports) > 0:
        imports += "\n"
    return imports
