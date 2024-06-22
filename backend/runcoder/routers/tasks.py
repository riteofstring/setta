from fastapi import APIRouter, Depends

from runcoder.tasks.fns.typeCheckRequest import TypeCheckRequestMessage
from runcoder.utils.constants import C

from .dependencies import get_tasks

router = APIRouter()


@router.post(C.ROUTE_PARAMETERS_REQUEST)
async def route_parameters_request(x, tasks=Depends(get_tasks)):
    # result = await tasks("parametersRequest", x)
    # return result["output"]
    pass


@router.post(C.ROUTE_TYPE_CHECK_REQUEST)
async def route_type_check_request(
    x: TypeCheckRequestMessage, tasks=Depends(get_tasks)
):
    # result = await tasks("typeCheckRequest", x)
    # return result["output"]
    pass
