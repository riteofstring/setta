from fastapi import Request, WebSocket


def get_dbq(request: Request):
    return request.app.state.dbq


def get_settings_file(request: Request):
    return request.app.state.settings_file


def get_terminals(request: Request):
    return request.app.state.terminals


def get_terminals_from_websocket(websocket: WebSocket):
    return websocket.app.state.terminals


def get_websocket_manager_from_websocket(websocket: WebSocket):
    return websocket.app.state.websocket_manager


def get_wmh_artifact(request: Request):
    return request.app.state.websocket_msg_handlers.artifact


def get_wmh_database(request: Request):
    return request.app.state.websocket_msg_handlers.database


def get_wmh_terminals(request: Request):
    return request.app.state.websocket_msg_handlers.terminals


def get_wmh_frontend_from_websocket(websocket: WebSocket):
    return websocket.app.state.websocket_msg_handlers.frontend


def get_wmh_cli_from_websocket(websocket: WebSocket):
    return websocket.app.state.websocket_msg_handlers.cli


def get_wmh_python_script_from_websocket(websocket: WebSocket):
    return websocket.app.state.websocket_msg_handlers.python_script


def get_wmh_python_logger_from_websocket(websocket: WebSocket):
    return websocket.app.state.websocket_msg_handlers.python_logger


def get_wmh_mcp_client(request: Request):
    return request.app.state.websocket_msg_handlers.mcp_client


def get_wmh_mcp_client_from_websocket(websocket: WebSocket):
    return websocket.app.state.websocket_msg_handlers.mcp_client


def get_wmh_specific_file_watcher(request: Request):
    return request.app.state.websocket_msg_handlers.specific_file_watcher


def get_lsps(request: Request):
    return [
        request.app.state.lsps,
        request.app.state.lsp_readers,
        request.app.state.lsp_writers,
    ]


def get_lsp_writers(request: Request):
    return request.app.state.lsp_writers


def get_lsp_writers_from_websocket(websocket: WebSocket):
    return websocket.app.state.lsp_writers


def get_code_tasks(request: Request):
    return request.app.state.code_tasks


def get_code_state(request: Request):
    return request.app.state.code_state


def get_code_state_from_websocket(websocket: WebSocket):
    return websocket.app.state.code_state


def get_specific_file_watcher(request: Request):
    return request.app.state.specific_file_watcher


def get_mcp_client(request: Request):
    return request.app.state.mcp_client

def get_chat_manager(request: Request):
    return request.app.state.chat_manager
