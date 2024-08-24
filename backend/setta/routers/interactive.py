from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.utils.constants import C
from setta.tasks.fns.utils import import_code_from_string
from .dependencies import get_tasks

router = APIRouter()

class UpdateInteractiveCodeRequest(BaseModel):
    code: str



@router.post(C.ROUTE_UPDATE_INTERACTIVE_CODE)
def route_update_interactive_code(x: UpdateInteractiveCodeRequest, tasks=Depends(get_tasks)):
    try:
        tasks.add_fns_from_string(x.code)
        # print("module", module, flush=True)
    except Exception as e:
        print("e", e, flush=True)
        return {"error": str(e)}
