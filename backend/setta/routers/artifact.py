from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.utils.constants import C

from .dependencies import get_websocket_manager

router = APIRouter()


class SendArtifactRequest(BaseModel):
    data: Dict[str, Any]
    sendDataTo: str
    messageType: str


@router.post(C.ROUTE_SEND_ARTIFACT)
async def route_send_artifact(
    x: SendArtifactRequest, websocket_manager=Depends(get_websocket_manager)
):
    x = x.dict()
    location = x.pop("sendDataTo")
    messageType = x.pop("messageType")
    await websocket_manager.send_message_to_location(x, messageType, location)
