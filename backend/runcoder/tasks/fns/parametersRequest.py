import docstring_parser

from runcoder.autocomplete.python.jedi.autocomplete import (
    get_parameters as jedi_get_parameters,
)
from runcoder.code_gen.python.generate_code import append_to_line

from .autocomplete import autocomplete, completionHelper, read_cache
from .utils import TaskDefinition


def parametersRequestFn(
    beforeText, code, var_name_to_line_num, var_name, referencable_var_names, column
):
    print("parametersRequest", flush=True)
    results, line = autocomplete(code, var_name_to_line_num, var_name, column)
    parsed = docstring_parser.parse(results[0].docstring(raw=True))
    descriptions = {v.arg_name: v.description for v in parsed.params}

    code = append_to_line(code, line, "(")
    signatures = jedi_get_parameters(code, line)
    output = []
    if signatures:
        signature = signatures[0]
        for param in signature.params:
            # If a default value is present, it will be included in the bracket.
            defaultVal = (
                param.description.split("=")[-1].strip()
                if "=" in param.description
                else None
            )
            output.append(
                {
                    "name": param.name,
                    "defaultVal": defaultVal,
                    "description": descriptions.get(param.name, ""),
                }
            )

    return output


def _parametersRequest(message):
    return completionHelper(message, "parameters", parametersRequestFn)


parametersRequest = TaskDefinition(fn=_parametersRequest, read_cache=read_cache)
