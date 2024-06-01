from fastapi import APIRouter, Depends

from runcoder.tasks.fns.autocomplete import CodeCompletionContent
from runcoder.tasks.fns.textFieldInitializeCode import TextFieldInitializeCodeContent
from runcoder.tasks.fns.typeCheckRequest import TypeCheckRequestMessage
from runcoder.tasks.fns.utils import TaskMessage
from runcoder.utils.constants import C

from .dependencies import get_tasks

router = APIRouter()


@router.post(C.ROUTE_PARAMETERS_REQUEST)
async def route_parameters_request(x: CodeCompletionContent, tasks=Depends(get_tasks)):
    result = await tasks(TaskMessage(fn_name="parametersRequest", content=x))
    return result["output"]


@router.post(C.ROUTE_TEXT_FIELD_INITIALIZE_CODE)
async def route_text_field_initialize_code(
    x: TextFieldInitializeCodeContent, tasks=Depends(get_tasks)
):
    result = await tasks(TaskMessage(fn_name="textFieldInitializeCode", content=x))
    return result["output"]


@router.post(C.ROUTE_TYPE_CHECK_REQUEST)
async def route_type_check_request(
    x: TypeCheckRequestMessage, tasks=Depends(get_tasks)
):
    result = await tasks(TaskMessage(fn_name="typeCheckRequest", content=x))
    return result["output"]


@router.post(C.ROUTE_TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: CodeCompletionContent, tasks=Depends(get_tasks)
):
    result = await tasks(TaskMessage(fn_name="textFieldCompletion", content=x))
    return result["output"]
