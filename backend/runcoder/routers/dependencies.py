from fastapi import Request, WebSocket


def get_dbs(request: Request):
    return request.app.state.dbs


def get_tasks_and_cache(request: Request):
    return [request.app.state.tasks_obj, request.app.state.cache]


def get_terminal_websockets(websocket: WebSocket):
    return websocket.app.state.terminal_websockets


def get_websocket_manager(websocket: WebSocket):
    return websocket.app.state.websocket_manager


def get_interactive_fns(websocket: WebSocket):
    return websocket.app.state.interactive_fns
