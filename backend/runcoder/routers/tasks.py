from fastapi import APIRouter, Depends
from pydantic import BaseModel

from runcoder.tasks.processors import (
    getProcessorOutput,
    parametersRequest,
    textFieldCompletion,
    textFieldInitializeCode,
    typeCheckRequest,
)
from runcoder.utils.constants import C

from .dependencies import get_tasks_and_cache

router = APIRouter()


class ParametersRequestRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    beforeText: str
    fullText: str
    position: int
    evRefs: list


class TextFieldInitializeCode(BaseModel):
    project: dict
    sectionId: str
    paramInfoId: str | None


class TypeCheckRequestRequest(BaseModel):
    project: dict


class TextFieldCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    beforeText: str
    fullText: str
    position: int
    evRefs: list


@router.post(C.ROUTE_PARAMETERS_REQUEST)
async def route_parameters_request(
    x: ParametersRequestRequest, tasks_and_cache=Depends(get_tasks_and_cache)
):
    tasks, cache = tasks_and_cache
    result = await getProcessorOutput(
        parametersRequest,
        {"message": x.dict()},
        tasks,
        cache,
    )
    return result["output"]


@router.post(C.ROUTE_TEXT_FIELD_INITIALIZE_CODE)
async def route_text_field_initialize_code(
    x: TextFieldInitializeCode, tasks_and_cache=Depends(get_tasks_and_cache)
):
    tasks, cache = tasks_and_cache
    result = await getProcessorOutput(
        textFieldInitializeCode,
        {"message": x.dict()},
        tasks,
        cache,
    )
    return result["output"]


@router.post(C.ROUTE_TYPE_CHECK_REQUEST)
async def route_type_check_request(
    x: TypeCheckRequestRequest, tasks_and_cache=Depends(get_tasks_and_cache)
):
    tasks, cache = tasks_and_cache
    result = await getProcessorOutput(
        typeCheckRequest,
        {"message": x.dict()},
        tasks,
        cache,
    )
    return result["output"]


@router.post(C.ROUTE_TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: TextFieldCompletionRequest, tasks_and_cache=Depends(get_tasks_and_cache)
):
    tasks, cache = tasks_and_cache
    result = await getProcessorOutput(
        textFieldCompletion,
        {"message": x.dict()},
        tasks,
        cache,
    )
    print("textFieldCompletion", result["output"], flush=True)
    return result["output"]
