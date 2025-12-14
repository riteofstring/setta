import logging

from fastapi import WebSocket, WebSocketDisconnect

from setta.routers.dependencies import (
    ReadyAppStateFromWebsocket as AppStateFromWebsocket,
)
from setta.routers.setta_api_router import SettaAPIRouter
from setta.logging.context_bindings import bind_websocket_logging_context
from setta.logging.errors import log_route_failure
from setta.types.routes import Route
from setta.types.websocket import WebsocketConnectionType
from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)
from setta.websockets.websocket_manager import WebsocketManager

router = SettaAPIRouter()


async def websocket_route_loop(
    websocket: WebSocket,
    websocket_manager: WebsocketManager,
    websocket_msg_handler: BaseWebsocketMsgReceiver,
    connectionType: WebsocketConnectionType,
    id: str | None = None,
):
    extra_context: dict[str, str] = {
        "connection_type": connectionType.value,
    }
    if id:
        extra_context["connection_id"] = id

    async with bind_websocket_logging_context(
        websocket,
        extra_values=extra_context,
    ):
        fromWebsocketId = None
        try:
            fromWebsocketId = await websocket_manager.on_connect(
                websocket, connectionType, id=id
            )
            await websocket_msg_handler.on_connect(fromWebsocketId)
            while True:
                try:
                    json_str = await websocket.receive_text()
                    websocket_manager.process_json_str(json_str, fromWebsocketId)
                    await websocket_msg_handler.process_json_str(
                        json_str, fromWebsocketId
                    )
                except WebSocketDisconnect:
                    logging.debug("WebSocketDisconnect!")
                    break
        except Exception as exc:
            context = {"websocket_connection_type": connectionType.value}
            if fromWebsocketId:
                context["websocket_id"] = fromWebsocketId
            log_route_failure(
                exc,
                label="websocket-route-loop",
                context=context,
            )
            raise
        finally:
            if fromWebsocketId:
                await websocket_manager.on_disconnect(fromWebsocketId)
                await websocket_msg_handler.on_disconnect(fromWebsocketId)


@router.websocket(Route.WEBSOCKET_FRONTEND)
async def route_websocket_frontend(websocket: WebSocket, state: AppStateFromWebsocket):
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_frontend_receiver,
        WebsocketConnectionType.FRONTEND,
    )


@router.websocket(Route.WEBSOCKET_CLI)
@router.websocket(Route.WEBSOCKET_CLI_WITH_ID)
async def route_websocket_cli(
    websocket: WebSocket,
    state: AppStateFromWebsocket,
    id: str | None = None,
):
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_cli_receiver,
        WebsocketConnectionType.CLI,
        id=id,
    )


@router.websocket(Route.WEBSOCKET_PYTHON_SCRIPT)
async def route_websocket_python_script(
    websocket: WebSocket,
    state: AppStateFromWebsocket,
    id: str,
):
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_python_script_receiver,
        WebsocketConnectionType.PYTHON_SCRIPT,
        id=id,
    )
