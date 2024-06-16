from fastapi import APIRouter, Depends

from runcoder.code_gen.python.generate_code import prepend_with_imports
from runcoder.tasks.fns.autocomplete import CodeCompletionMessage
from runcoder.tasks.fns.textFieldInitializeCode import TextFieldInitializeCodeMessage
from runcoder.tasks.fns.typeCheckRequest import TypeCheckRequestMessage
from runcoder.utils.constants import C

from .dependencies import get_lsp_writer, get_tasks

router = APIRouter()


@router.post(C.ROUTE_PARAMETERS_REQUEST)
async def route_parameters_request(x: CodeCompletionMessage, tasks=Depends(get_tasks)):
    # result = await tasks("parametersRequest", x)
    # return result["output"]
    pass


@router.post(C.ROUTE_TEXT_FIELD_INITIALIZE_CODE)
async def route_text_field_initialize_code(
    x: TextFieldInitializeCodeMessage,
    tasks=Depends(get_tasks),
    lsp_writer=Depends(get_lsp_writer)
):
    result = await tasks("textFieldInitializeCode", x)
    lines, var_name_to_line_num, _, templatedCode, _ = result["cache"]
    code, _ = prepend_with_imports(lines, templatedCode, None, var_name_to_line_num)
    await lsp_writer.send_document_open_request(code, x.content.project["projectConfig"]["id"])
    return result["output"]


@router.post(C.ROUTE_TYPE_CHECK_REQUEST)
async def route_type_check_request(
    x: TypeCheckRequestMessage, tasks=Depends(get_tasks)
):
    # result = await tasks("typeCheckRequest", x)
    # return result["output"]
    pass


@router.post(C.ROUTE_TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: CodeCompletionMessage, tasks=Depends(get_tasks)
):
    # result = await tasks("textFieldCompletion", x)
    # return result["output"]
    pass
