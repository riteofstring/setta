from typing import Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.utils.constants import C

from .dependencies import get_tasks

router = APIRouter()


class UpdateInteractiveCodeRequest(BaseModel):
    codeDict: Dict[str, str]
    projectConfigName: str


@router.post(C.ROUTE_UPDATE_INTERACTIVE_CODE)
def route_update_interactive_code(
    x: UpdateInteractiveCodeRequest, tasks=Depends(get_tasks)
):
    task_names, error_msgs = tasks.add_custom_fns(x.codeDict, x.projectConfigName)
    return {"task_names": task_names, "error_msgs": error_msgs}
