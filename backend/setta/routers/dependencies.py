from typing import Annotated, AsyncGenerator

from fastapi import Depends, HTTPException, Request, WebSocket, status
from starlette.websockets import WebSocketDisconnect, WebSocketState

from setta.runtime.context import RuntimeContext
from setta.server_state import SettaFastAPIState
from setta.share.session_context import reset_share_session_id, set_share_session_id
from setta.utils.constants import C


def get_app_state_from_request(request: Request) -> SettaFastAPIState:
    return request.app.state.setta


def maybe_get_app_state_from_request(request: Request) -> SettaFastAPIState | None:
    return getattr(request.app.state, "setta", None)


def get_app_state_from_websocket(websocket: WebSocket) -> SettaFastAPIState:
    return websocket.app.state.setta


async def get_ready_app_state_from_request(request: Request) -> SettaFastAPIState:
    state = get_app_state_from_request(request)
    await state.wait_until_ready()
    return state


async def get_ready_app_state_from_websocket(websocket: WebSocket) -> SettaFastAPIState:
    state = get_app_state_from_websocket(websocket)
    await state.wait_until_ready()
    return state


def _extract_share_session_id(headers, cookies, query_params) -> str:
    session_id = headers.get("x-share-session-id")
    if not session_id:
        session_id = cookies.get("shareSessionId")
    if not session_id:
        session_id = query_params.get("shareSessionId")
    if not session_id:
        raise KeyError("Missing share session id")
    return session_id


def _maybe_extract_share_session_id(headers, cookies, query_params) -> str | None:
    session_id = headers.get("x-share-session-id")
    if not session_id:
        session_id = cookies.get("shareSessionId")
    if not session_id:
        session_id = query_params.get("shareSessionId")
    return session_id


async def _close_websocket_with_code(websocket: WebSocket, code: int) -> None:
    if websocket.application_state == WebSocketState.CONNECTING:
        await websocket.accept()
    await websocket.close(code=code)


def get_share_session_id_from_request(request: Request) -> str:
    return _extract_share_session_id(
        request.headers, request.cookies, request.query_params
    )


def get_share_session_id_from_websocket(websocket: WebSocket) -> str:
    return _extract_share_session_id(
        websocket.headers, websocket.cookies, websocket.query_params
    )


def maybe_get_share_session_id_from_request(request: Request) -> str | None:
    return _maybe_extract_share_session_id(
        request.headers, request.cookies, request.query_params
    )


def maybe_get_share_session_id_from_websocket(websocket: WebSocket) -> str | None:
    return _maybe_extract_share_session_id(
        websocket.headers, websocket.cookies, websocket.query_params
    )


def require_ide_mode(
    state: SettaFastAPIState | None = Depends(maybe_get_app_state_from_request),
) -> None:
    share_mode = state.share_mode if state is not None else C.SHARE_MODE
    if share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Share mode does not allow this endpoint.",
        )


def require_share_session_id(
    state: SettaFastAPIState,
    share_session_id: str | None,
    *,
    create_session_state: bool = True,
) -> str | None:
    if not state.share_mode:
        return None
    if share_session_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing share session id.",
        )
    if not state.share_session_store.has_session(share_session_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown share session id: {share_session_id}",
        )
    state.share_session_store.touch_session(share_session_id)
    if create_session_state:
        state.share_project_manager.get_or_create_session_state(share_session_id)
    return share_session_id


async def require_share_session_id_from_websocket(
    websocket: WebSocket,
    state: SettaFastAPIState,
    *,
    create_session_state: bool = True,
) -> str | None:
    if not state.share_mode:
        return None
    share_session_id = maybe_get_share_session_id_from_websocket(websocket)
    if share_session_id is None:
        await _close_websocket_with_code(websocket, 4400)
        return None
    if not state.share_session_store.has_session(share_session_id):
        await _close_websocket_with_code(websocket, 4404)
        return None
    state.share_session_store.touch_session(share_session_id)
    if create_session_state:
        state.share_project_manager.get_or_create_session_state(share_session_id)
    return share_session_id


async def get_runtime_context_from_request(
    request: Request,
) -> AsyncGenerator[RuntimeContext, None]:
    state = await get_ready_app_state_from_request(request)
    share_session_id = None
    if state.share_mode:
        share_session_id = require_share_session_id(
            state,
            maybe_get_share_session_id_from_request(request),
        )
    token = set_share_session_id(share_session_id)
    try:
        yield RuntimeContext(state, share_session_id=share_session_id)
    finally:
        reset_share_session_id(token)


async def get_runtime_context_from_websocket(
    websocket: WebSocket,
) -> AsyncGenerator[RuntimeContext, None]:
    state = await get_ready_app_state_from_websocket(websocket)
    share_session_id = None
    if state.share_mode:
        share_session_id = await require_share_session_id_from_websocket(
            websocket,
            state,
        )
        if share_session_id is None:
            raise WebSocketDisconnect()
    token = set_share_session_id(share_session_id)
    try:
        yield RuntimeContext(state, share_session_id=share_session_id)
    finally:
        reset_share_session_id(token)


AppStateFromRequest = Annotated[SettaFastAPIState, Depends(get_app_state_from_request)]
ReadyAppStateFromRequest = Annotated[
    SettaFastAPIState, Depends(get_ready_app_state_from_request)
]
AppStateFromWebsocket = Annotated[
    SettaFastAPIState, Depends(get_app_state_from_websocket)
]
ReadyAppStateFromWebsocket = Annotated[
    SettaFastAPIState, Depends(get_ready_app_state_from_websocket)
]
MaybeShareSessionIdFromRequest = Annotated[
    str | None, Depends(maybe_get_share_session_id_from_request)
]
RuntimeContextFromRequest = Annotated[
    RuntimeContext, Depends(get_runtime_context_from_request)
]
RuntimeContextFromWebsocket = Annotated[
    RuntimeContext, Depends(get_runtime_context_from_websocket)
]
