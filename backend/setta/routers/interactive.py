from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.tasks.fns.utils import import_code_from_string
from setta.utils.constants import C

from .dependencies import get_tasks

router = APIRouter()


class UpdateInteractiveCodeRequest(BaseModel):
    code: str


@router.post(C.ROUTE_UPDATE_INTERACTIVE_CODE)
def route_update_interactive_code(
    x: UpdateInteractiveCodeRequest, tasks=Depends(get_tasks)
):
    error_msg = tasks.add_fns_from_string(x.code)
    if error_msg:
        return {"error": str(error_msg)}
