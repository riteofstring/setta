from setta.code_gen.python.generate_code import append_to_line
from setta.tasks.task_runner import RunType

from .textFieldAutocomplete import completionHelper, read_cache
from .utils import TaskDefinition


def parametersRequestFn(lsp_writers):
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
        await lsp_writers["full"].send_document_update(code_id, code, codeJson)
        await lsp_writers["full"].send_signature_help_request(
            line, column, code_id, request_id
        )

    return fn


async def _parametersRequest(message, lsp_writers):
    return await completionHelper(message, parametersRequestFn(lsp_writers))


parametersRequest = TaskDefinition(
    name="parametersRequest",
    return_message_type="parametersRequestReturn",
    fn=_parametersRequest,
    read_cache=read_cache,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
