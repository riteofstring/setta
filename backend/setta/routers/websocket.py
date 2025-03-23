import json
import logging
import traceback
from typing import Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from setta.utils.constants import C

from .dependencies import (
    get_websocket_manager_from_websocket,
    get_wmh_cli_from_websocket,
    get_wmh_frontend_from_websocket,
    get_wmh_python_script_from_websocket,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def websocket_route_loop(
    websocket, websocket_manager, websocket_msg_handler, connectionType, id=None
):
    fromWebsocketId = await websocket_manager.connect(websocket, connectionType, id=id)
    while True:
        try:
            data = await websocket.receive_text()
            message = json.loads(data)
            websocket_manager.process_message(message, fromWebsocketId)
            await websocket_msg_handler.process_message(message, fromWebsocketId)
        except WebSocketDisconnect:
            logger.debug("WebSocketDisconnect!")
            await websocket_manager.disconnect(fromWebsocketId)
            break
        except Exception as e:
            logger.debug(f"Exception details:\n{traceback.format_exc()}")
            logger.debug(e)
            logger.debug("caught the exception!")

    websocket_msg_handler.disconnect(fromWebsocketId)


@router.websocket(C.ROUTE_WEBSOCKET_FRONTEND)
async def route_websocket_frontend(
    websocket: WebSocket,
    websocket_manager=Depends(get_websocket_manager_from_websocket),
    websocket_msg_handler=Depends(get_wmh_frontend_from_websocket),
):
    await websocket_route_loop(
        websocket,
        websocket_manager,
        websocket_msg_handler,
        C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
    )


@router.websocket(C.ROUTE_WEBSOCKET_CLI)
@router.websocket(C.ROUTE_WEBSOCKET_CLI_WITH_ID)
async def route_websocket_cli(
    websocket: WebSocket,
    id: Optional[str] = None,
    websocket_manager=Depends(get_websocket_manager_from_websocket),
    websocket_msg_handler=Depends(get_wmh_cli_from_websocket),
):
    await websocket_route_loop(
        websocket,
        websocket_manager,
        websocket_msg_handler,
        C.WEBSOCKET_CONNECTION_TYPE_CLI,
        id=id,
    )


@router.websocket(C.ROUTE_WEBSOCKET_PYTHON_SCRIPT)
async def route_websocket_python_script(
    websocket: WebSocket,
    websocket_manager=Depends(get_websocket_manager_from_websocket),
    websocket_msg_handler=Depends(get_wmh_python_script_from_websocket),
):
    await websocket_route_loop(
        websocket,
        websocket_manager,
        websocket_msg_handler,
        C.WEBSOCKET_CONNECTION_TYPE_PYTHON_SCRIPT,
    )
