from runcoder.code_gen.python.generate_code import append_to_line, var_declaration
from runcoder.tasks.task_runner import RunType

from .autocomplete import completionHelper, read_cache
from .utils import TaskDefinition


def parametersRequestFn(lsp_writer):
    async def fn(
        code_id,
        request_id,
        beforeText,
        code,
        var_name_to_line_num,
        var_name,
        referencable_var_names,
        column,
    ):
        print("parametersRequest", flush=True)
        line = var_name_to_line_num[var_name]
        code = append_to_line(code, line, "(")
        print(code)
        await lsp_writer.send_document_update(code_id, code)
        column = column + len(var_declaration(var_name, "")) + 1
        await lsp_writer.send_signature_help_request(line, column, code_id, request_id)

    return fn


async def _parametersRequest(message, lsp_writer):
    return await completionHelper(
        message, "parameters", parametersRequestFn(lsp_writer)
    )


parametersRequest = TaskDefinition(
    name="parametersRequest",
    fn=_parametersRequest,
    read_cache=read_cache,
    run_as=RunType.THREAD,
    is_built_in=True,
    dependencies=["lsp_writer"],
)
