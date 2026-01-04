from typing import Annotated

from fastapi import Depends, Request, WebSocket

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
