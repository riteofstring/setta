from typing import Annotated

from fastapi import Depends, Request, WebSocket

from setta.server import SettaFastAPIState


def get_app_state_from_request(request: Request) -> SettaFastAPIState:
    return request.app.state.setta


def get_app_state_from_websocket(websocket: WebSocket) -> SettaFastAPIState:
    return websocket.app.state.setta


AppStateFromRequest = Annotated[SettaFastAPIState, Depends(get_app_state_from_request)]
