from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.utils.constants import C

from .dependencies import get_websocket_manager

router = APIRouter()


class SendDataRequest(BaseModel):
    data: Dict[str, Any]
    sendDataTo: str


@router.post(C.ROUTE_SEND_DATA)
async def route_send_data(
    x: SendDataRequest, websocket_manager=Depends(get_websocket_manager)
):
    print("route_send_data", x, flush=True)
    await websocket_manager.send_message_to_location(x.data, x.sendDataTo)
