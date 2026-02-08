import logging
from typing import TYPE_CHECKING

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from setta.auth.cookies import auth_cookie_name
from setta.auth.headers import extract_bearer_token
from setta.auth.session import load_current_session_secret
from setta.auth.validation import consume_bootstrap_token, validate_auth_cookie
from setta.logging.context import get_logging_context, push_logging_context
from setta.logging.context_bindings import bind_websocket_logging_context
from setta.routers.dependencies import (
    ReadyAppStateFromWebsocket as AppStateFromWebsocket,
)
from setta.routers.dependencies import require_share_session_id_from_websocket
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

if TYPE_CHECKING:
    from setta.share.session_store import ShareSessionStore

router = SettaAPIRouter()
logger = logging.getLogger(__name__)


async def _authenticate_websocket(websocket: WebSocket) -> bool:
    session_info = load_current_session_secret()
    if session_info is None:
        await _close_unauthorized(websocket)
        return False
    session_metadata, secret = session_info
    cookie_value = websocket.cookies.get(auth_cookie_name(session_metadata.id))
    if cookie_value:
        cookie_payload = validate_auth_cookie(cookie_value, session_metadata.id, secret)
        if cookie_payload is not None:
            return True

    bearer_token = extract_bearer_token(websocket.headers)
    if bearer_token:
        token_payload = consume_bootstrap_token(
            bearer_token, session_metadata.id, secret
        )
        if token_payload is not None:
            return True

    await _close_unauthorized(websocket)
    return False


async def _maybe_authenticate_websocket(
    websocket: WebSocket, *, share_mode: bool
) -> bool:
    if share_mode:
        return True
    return await _authenticate_websocket(websocket)


async def _close_with_code(websocket: WebSocket, code: int) -> None:
    if websocket.application_state == WebSocketState.CONNECTING:
        await websocket.accept()
    await websocket.close(code=code)


async def _close_unauthorized(websocket: WebSocket) -> None:
    await _close_with_code(websocket, 4401)


async def _close_forbidden(websocket: WebSocket) -> None:
    await _close_with_code(websocket, 4403)


async def _close_not_found(websocket: WebSocket) -> None:
    await _close_with_code(websocket, 4404)


async def websocket_route_loop(
    websocket: WebSocket,
    websocket_manager: WebsocketManager,
    websocket_msg_handler: BaseWebsocketMsgReceiver,
    frontend_sender: WMHFrontendSender,
    connectionType: WebsocketConnectionType,
    id: str | None = None,
    share_session_id: str | None = None,
    share_session_store: "ShareSessionStore | None" = None,
    *,
    broadcast_connections: bool = True,
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
                websocket,
                connectionType,
                id=id,
                shareSessionId=share_session_id,
                broadcast_connections=broadcast_connections,
            )
            if fromWebsocketId:
                push_logging_context(connection_id=fromWebsocketId)
            await websocket_msg_handler.on_connect(fromWebsocketId)
            while True:
                try:
                    message = await websocket.receive()
                    if share_session_id is not None and share_session_store is not None:
                        if not share_session_store.has_session(share_session_id):
                            await _close_not_found(websocket)
                            break
                        share_session_store.touch_session(share_session_id)
                    message_type = message.get("type")
                    if message_type == "websocket.disconnect":
                        break
                    if message_type != "websocket.receive":
                        continue
                    text_payload = message.get("text")
                    if text_payload is not None:
                        await websocket_msg_handler.process_json_str(
                            text_payload, fromWebsocketId
                        )
                        continue
                    binary_payload = message.get("bytes")
                    if binary_payload is not None:
                        await websocket_msg_handler.process_bytes(
                            binary_payload, fromWebsocketId
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
                share_session_id=share_session_id,
            )
            raise
        finally:
            if fromWebsocketId:
                await websocket_manager.on_disconnect(
                    fromWebsocketId,
                    broadcast_connections=broadcast_connections,
                )
                await websocket_msg_handler.on_disconnect(fromWebsocketId)


@router.websocket(Route.WEBSOCKET_FRONTEND)
async def route_websocket_frontend(websocket: WebSocket, state: AppStateFromWebsocket):
    if not await _maybe_authenticate_websocket(websocket, share_mode=state.share_mode):
        return
    share_session_id = None
    if state.share_mode:
        share_session_id = await require_share_session_id_from_websocket(
            websocket,
            state,
        )
        if share_session_id is None:
            return
        await state.share_listener_runtime.ensure_listener_for_session(
            share_session_id,
            state.share_runtime_state.default_project_config_id,
        )
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_frontend_receiver,
        state.wmh_frontend_sender,
        WebsocketConnectionType.FRONTEND,
        share_session_id=share_session_id,
        share_session_store=state.share_session_store if state.share_mode else None,
        broadcast_connections=not state.share_mode,
    )


@router.websocket(Route.WEBSOCKET_SHARE_FRONTEND)
async def route_websocket_share_frontend(
    websocket: WebSocket, state: AppStateFromWebsocket
):
    if not state.share_mode:
        await _close_forbidden(websocket)
        return
    if not await _maybe_authenticate_websocket(websocket, share_mode=state.share_mode):
        return
    share_session_id = await require_share_session_id_from_websocket(
        websocket,
        state,
    )
    if share_session_id is None:
        return
    await state.share_listener_runtime.ensure_listener_for_session(
        share_session_id,
        state.share_runtime_state.default_project_config_id,
    )
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_frontend_receiver,
        state.wmh_frontend_sender,
        WebsocketConnectionType.FRONTEND,
        share_session_id=share_session_id,
        share_session_store=state.share_session_store,
        broadcast_connections=False,
    )


@router.websocket(Route.WEBSOCKET_CLI)
@router.websocket(Route.WEBSOCKET_CLI_WITH_ID)
async def route_websocket_cli(
    websocket: WebSocket,
    state: AppStateFromWebsocket,
    id: str | None = None,
):
    if state.share_mode:
        await _close_forbidden(websocket)
        return
    if not await _maybe_authenticate_websocket(websocket, share_mode=state.share_mode):
        return
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_cli_receiver,
        state.wmh_frontend_sender,
        WebsocketConnectionType.CLI,
        id=id,
        share_session_store=state.share_session_store if state.share_mode else None,
        broadcast_connections=not state.share_mode,
    )


@router.websocket(Route.WEBSOCKET_PYTHON_SCRIPT)
async def route_websocket_python_script(
    websocket: WebSocket,
    state: AppStateFromWebsocket,
    id: str,
):
    if not await _maybe_authenticate_websocket(websocket, share_mode=state.share_mode):
        return
    share_session_id = None
    if state.share_mode:
        share_session_id = await require_share_session_id_from_websocket(
            websocket,
            state,
        )
        if share_session_id is None:
            return
    await websocket_route_loop(
        websocket,
        state.websocket_manager,
        state.wmh_python_script_receiver,
        state.wmh_frontend_sender,
        WebsocketConnectionType.PYTHON_SCRIPT,
        id=id,
        share_session_id=share_session_id,
        share_session_store=state.share_session_store if state.share_mode else None,
        broadcast_connections=not state.share_mode,
    )
