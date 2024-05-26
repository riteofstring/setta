from fastapi import APIRouter, Depends
from pydantic import BaseModel

from runcoder.utils.constants import C

from .dependencies import get_tasks

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
    x: ParametersRequestRequest, tasks=Depends(get_tasks)
):
    result = await tasks("parametersRequest", {"message": x.dict()})
    return result["output"]


@router.post(C.ROUTE_TEXT_FIELD_INITIALIZE_CODE)
async def route_text_field_initialize_code(
    x: TextFieldInitializeCode, tasks=Depends(get_tasks)
):
    result = await tasks("textFieldInitializeCode", {"message": x.dict()})
    return result["output"]


@router.post(C.ROUTE_TYPE_CHECK_REQUEST)
async def route_type_check_request(
    x: TypeCheckRequestRequest, tasks=Depends(get_tasks)
):
    result = await tasks("typeCheckRequest", {"message": x.dict()})
    return result["output"]


@router.post(C.ROUTE_TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: TextFieldCompletionRequest, tasks=Depends(get_tasks)
):
    result = await tasks("textFieldCompletion", {"message": x.dict()})
    return result["output"]
