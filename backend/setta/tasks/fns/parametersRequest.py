import jedi

from setta.code_gen.python.generate_code import (
    append_to_line,
    position_to_line_col,
    var_declaration,
)
from setta.tasks.task_runner import RunType

from .textFieldAutocomplete import completionHelper, read_cache
from .utils import TaskDefinition


def parametersRequestFn(lsp_writer, use_jedi=False):
    async def fn(
        code_id,
        request_id,
        code,
        codeJson,
        line,
        column,
        **_,
    ):
        code = append_to_line(code, line, "()")
        # the +1 below is to move the cursor into the parentheses.
        column += 1
        print("parametersRequest", flush=True)
        print(code, flush=True)
        await lsp_writer.send_document_update(code_id, code, codeJson)
        if use_jedi:
            return jedi_get_signature(code, line, column)
        else:
            await lsp_writer.send_signature_help_request(
                line, column, code_id, request_id
            )

    return fn


async def _parametersRequest(message, lsp_writer, settings_file):
    return await completionHelper(message, parametersRequestFn(lsp_writer), settings_file.settings["inferImports"])


parametersRequest = TaskDefinition(
    name="parametersRequest",
    return_message_type="parametersRequestReturn",
    fn=_parametersRequest,
    read_cache=read_cache,
    run_as=RunType.THREAD,
    dependencies=["lsp_writer", "settings_file"],
)


def jedi_get_signature(code, line, column):
    # results, line = autocomplete(code, var_name_to_line_num, var_name, column)
    # parsed = docstring_parser.parse(results[0].docstring(raw=True))
    # descriptions = {v.arg_name: v.description for v in parsed.params}
    descriptions = {}

    signatures = jedi.Script(code).get_signatures(line + 1, column)
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
                {"name": param.name, "defaultVal": defaultVal, "description": ""}
            )

    return output
