from fastapi import Request, WebSocket


def get_dbs(request: Request):
    return request.app.state.dbs


def get_tasks(request: Request):
    return request.app.state.tasks


def get_terminal_websockets_from_websocket(websocket: WebSocket):
    return websocket.app.state.terminal_websockets


def get_terminal_websockets(request: Request):
    return request.app.state.terminal_websockets


def get_websocket_manager(websocket: WebSocket):
    return websocket.app.state.websocket_manager
