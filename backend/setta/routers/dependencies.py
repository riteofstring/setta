from typing import TYPE_CHECKING, Annotated, AsyncGenerator

from fastapi import Depends, HTTPException, Request, WebSocket, status

from setta.server_state import SettaFastAPIState
from setta.share.session_context import reset_share_session_id, set_share_session_id

if TYPE_CHECKING:
    from setta.share.session_store import ShareSession
    from setta.types.project_state import ProjectStateSingleConfig


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


async def share_session_context_from_request(
    request: Request,
) -> AsyncGenerator[str | None, None]:
    state = await get_ready_app_state_from_request(request)
    if not state.share_mode:
        yield None
        return
    session_id = maybe_get_share_session_id_from_request(request)
    if session_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing share session id.",
        )
    token = set_share_session_id(session_id)
    try:
        yield session_id
    finally:
        reset_share_session_id(token)


async def get_share_session_from_request(request: Request) -> "ShareSession":
    state = await get_ready_app_state_from_request(request)
    session_id = get_share_session_id_from_request(request)
    return state.share_session_store.get_session(session_id)


async def get_share_session_from_websocket(websocket: WebSocket) -> "ShareSession":
    state = await get_ready_app_state_from_websocket(websocket)
    session_id = get_share_session_id_from_websocket(websocket)
    return state.share_session_store.get_session(session_id)


async def get_share_session_state_from_request(
    request: Request,
) -> "ProjectStateSingleConfig":
    state = await get_ready_app_state_from_request(request)
    session_id = get_share_session_id_from_request(request)
    state.share_session_store.get_session(session_id)
    return state.share_project_manager.get_or_create_session_state(session_id)


async def get_share_session_state_from_websocket(
    websocket: WebSocket,
) -> "ProjectStateSingleConfig":
    state = await get_ready_app_state_from_websocket(websocket)
    session_id = get_share_session_id_from_websocket(websocket)
    state.share_session_store.get_session(session_id)
    return state.share_project_manager.get_or_create_session_state(session_id)


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
ShareSessionIdFromRequest = Annotated[str, Depends(get_share_session_id_from_request)]
MaybeShareSessionIdFromRequest = Annotated[
    str | None, Depends(maybe_get_share_session_id_from_request)
]
ShareSessionIdFromWebsocket = Annotated[
    str, Depends(get_share_session_id_from_websocket)
]
ShareSessionFromRequest = Annotated[
    "ShareSession", Depends(get_share_session_from_request)
]
ShareSessionFromWebsocket = Annotated[
    "ShareSession", Depends(get_share_session_from_websocket)
]
ShareSessionStateFromRequest = Annotated[
    "ProjectStateSingleConfig", Depends(get_share_session_state_from_request)
]
ShareSessionStateFromWebsocket = Annotated[
    "ProjectStateSingleConfig", Depends(get_share_session_state_from_websocket)
]
