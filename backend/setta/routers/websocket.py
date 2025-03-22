import json
import logging
import traceback

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from setta.utils.constants import C

from .dependencies import (
    get_websocket_manager_from_websocket,
    get_wmh_frontend_from_websocket,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def websocket_route_loop(websocket, websocket_manager, callback):
    id = await websocket_manager.connect(websocket)
    while True:
        try:
            data = await websocket.receive_text()
            await callback(
                json.loads(data),
                id,
            )
        except WebSocketDisconnect:
            logger.debug("WebSocketDisconnect!")
            await websocket_manager.disconnect(id)
            break
        except Exception as e:
            logger.debug(f"Exception details:\n{traceback.format_exc()}")
            logger.debug(e)
            logger.debug("caught the exception!")


@router.websocket(C.ROUTE_WEBSOCKET_FRONTEND)
async def route_websocket_frontend(
    websocket: WebSocket,
    websocket_manager=Depends(get_websocket_manager_from_websocket),
    websocket_msg_handler=Depends(get_wmh_frontend_from_websocket),
):
    def callback(message, fromWebsocketId):
        websocket_msg_handler

    await websocket_route_loop(websocket, websocket_manager, callback)
