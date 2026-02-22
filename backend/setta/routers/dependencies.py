from typing import Annotated, AsyncGenerator

from fastapi import Depends, HTTPException, Request, WebSocket, status
from starlette.websockets import WebSocketDisconnect, WebSocketState

from setta.runtime.context import RuntimeContext
from setta.server_state import SettaFastAPIState


def get_app_state_from_request(request: Request) -> SettaFastAPIState:
    return request.app.state.setta


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


def _extract_share_session_id(
    headers,
    cookies,
    query_params,
    *,
    required: bool,
) -> str | None:
    session_id = headers.get("x-share-session-id")
    if not session_id:
        session_id = cookies.get("shareSessionId")
    if not session_id:
        session_id = query_params.get("shareSessionId")
    if session_id:
        return session_id
    if required:
        raise KeyError("Missing share session id")
    return None


async def _close_websocket_with_code(websocket: WebSocket, code: int) -> None:
    if websocket.application_state == WebSocketState.CONNECTING:
        await websocket.accept()
    await websocket.close(code=code)


def maybe_get_share_session_id_from_request(request: Request) -> str | None:
    return _extract_share_session_id(
        request.headers, request.cookies, request.query_params, required=False
    )


def require_ide_mode(
    state: SettaFastAPIState = Depends(get_app_state_from_request),
) -> None:
    if state.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Deployment mode does not allow this endpoint.",
        )


def require_full_ide_runtime(
    state: SettaFastAPIState = Depends(get_app_state_from_request),
) -> None:
    require_ide_mode(state)
    if getattr(state, "launcher_mode", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Launcher mode does not allow this endpoint.",
        )


def require_not_launcher_mode(
    state: SettaFastAPIState = Depends(get_app_state_from_request),
) -> None:
    if getattr(state, "launcher_mode", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Launcher mode does not allow this endpoint.",
        )


def require_launcher_mode(
    state: SettaFastAPIState = Depends(get_app_state_from_request),
) -> None:
    if not state.launcher_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Launcher mode does not allow this endpoint.",
        )


def require_share_session_id(
    state: SettaFastAPIState,
    share_session_id: str | None,
    *,
    create_session_backend: bool = True,
) -> str | None:
    if not state.deployment_mode:
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
    if create_session_backend:
        state.share_runtime_state.get_or_create_session_backend(share_session_id)
    return share_session_id


async def require_share_session_id_from_websocket(
    websocket: WebSocket,
    state: SettaFastAPIState,
    *,
    create_session_backend: bool = True,
) -> str | None:
    if not state.deployment_mode:
        return None
    share_session_id = _extract_share_session_id(
        websocket.headers,
        websocket.cookies,
        websocket.query_params,
        required=False,
    )
    if share_session_id is None:
        await _close_websocket_with_code(websocket, 4400)
        return None
    if not state.share_session_store.has_session(share_session_id):
        await _close_websocket_with_code(websocket, 4404)
        return None
    state.share_session_store.touch_session(share_session_id)
    if create_session_backend:
        state.share_runtime_state.get_or_create_session_backend(share_session_id)
    return share_session_id


async def get_runtime_context_from_request(
    request: Request,
) -> AsyncGenerator[RuntimeContext, None]:
    state = await get_ready_app_state_from_request(request)
    share_session_id = None
    if state.deployment_mode:
        share_session_id = require_share_session_id(
            state,
            maybe_get_share_session_id_from_request(request),
        )
    yield RuntimeContext(state, share_session_id=share_session_id)


async def get_runtime_context_from_websocket(
    websocket: WebSocket,
) -> AsyncGenerator[RuntimeContext, None]:
    state = await get_ready_app_state_from_websocket(websocket)
    share_session_id = None
    if state.deployment_mode:
        share_session_id = await require_share_session_id_from_websocket(
            websocket,
            state,
        )
        if share_session_id is None:
            raise WebSocketDisconnect()
    yield RuntimeContext(state, share_session_id=share_session_id)


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
RuntimeContextFromRequest = Annotated[
    RuntimeContext, Depends(get_runtime_context_from_request)
]
RuntimeContextFromWebsocket = Annotated[
    RuntimeContext, Depends(get_runtime_context_from_websocket)
]
