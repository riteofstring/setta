from typing import Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.utils.constants import C

from .dependencies import get_tasks

router = APIRouter()


class UpdateInteractiveCodeRequest(BaseModel):
    codeDict: Dict[str, str]


@router.post(C.ROUTE_UPDATE_INTERACTIVE_CODE)
def route_update_interactive_code(
    x: UpdateInteractiveCodeRequest, tasks=Depends(get_tasks)
):
    error_msgs = tasks.add_fns_from_strings(x.codeDict)
    return {"error_msgs": error_msgs}
