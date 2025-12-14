import logging

from fastapi import WebSocket, WebSocketDisconnect

from setta.logging.context import get_logging_context, push_logging_context
from setta.logging.context_bindings import bind_websocket_logging_context
from setta.routers.dependencies import (
    ReadyAppStateFromWebsocket as AppStateFromWebsocket,
)
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.routes import Route
from setta.types.websocket import WebsocketConnectionType
from setta.websockets.msg_handlers.base import (
    BaseWebsocketMsgReceiver,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

router = SettaAPIRouter()
logger = logging.getLogger(__name__)


async def websocket_route_loop(
    websocket: WebSocket,
    websocket_manager: WebsocketManager,
    websocket_msg_handler: BaseWebsocketMsgReceiver,
    frontend_sender: WMHFrontendSender,
    connectionType: WebsocketConnectionType,
    id: str | None = None,
):
    extra_context: dict[str, str] = {
        "connection_type": connectionType.value,
    }
    if id:
        extra_context["client_connection_id"] = id

    async with bind_websocket_logging_context(
        websocket,
        extra_values=extra_context,
    ):
        fromWebsocketId = None
        try:
            fromWebsocketId = await websocket_manager.on_connect(
                websocket, connectionType, id=id
            )
            if fromWebsocketId:
                push_logging_context(connection_id=fromWebsocketId)
            await websocket_msg_handler.on_connect(fromWebsocketId)
            while True:
                try:
                    json_str = await websocket.receive_text()
                    websocket_manager.process_json_str(json_str, fromWebsocketId)
                    await websocket_msg_handler.process_json_str(
                        json_str, fromWebsocketId
                    )
                except WebSocketDisconnect:
                    logger.debug("WebSocketDisconnect!")
                    break
        except Exception as exc:
            logging_context = get_logging_context()
            request_id = logging_context.get("request_id")
            project_config_id = logging_context.get("project_config_id")
            suffix = f" (request {request_id})" if request_id else ""
            exc_message = str(exc).replace("\n", " ").strip()
            exc_name = type(exc).__name__
            message = f"Websocket error{suffix}: {websocket.url.path} - {exc_name}"
            if exc_message:
                message = f"{message}: {exc_message}"

            context = {"websocket_connection_type": connectionType.value}
            if fromWebsocketId:
                context["connection_id"] = fromWebsocketId
            project_config_id = ID(project_config_id) if project_config_id else None
            await frontend_sender.log_failure_and_broadcast_backend_log_event(
                exc,
                label="websocket-route-loop",
                message=message,
                severity=SettaBackendLogEventSeverity.error,
                project_config_id=project_config_id,
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
        state.wmh_frontend_sender,
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
        state.wmh_frontend_sender,
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
        state.wmh_frontend_sender,
        WebsocketConnectionType.PYTHON_SCRIPT,
        id=id,
    )
