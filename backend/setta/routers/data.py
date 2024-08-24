from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.utils.constants import C

from .dependencies import get_tasks

router = APIRouter()


class SendDataRequest(BaseModel):
    data: Dict[str, Any]


@router.post(C.ROUTE_SEND_DATA)
def route_send_data(x: SendDataRequest):
    print("route_send_data", x, flush=True)
