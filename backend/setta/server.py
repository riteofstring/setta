import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import setta.mcp.backend_tools  # noqa: F401
import setta.mcp.frontend_tools  # noqa: F401
from setta.database.db_init import maybe_create_tables_and_seed
from setta.database.db_objs import DBQueue
from setta.database.settings_file import SettingsFile
from setta.lsp.managers import LSPReaders, LSPServers, LSPWriters, start_lsps, stop_lsps
from setta.lsp.specific_file_watcher import create_specific_file_watcher
from setta.mcp.chat_manager import ChatManager
from setta.mcp.client import MCPClient
from setta.mcp.server import add_mcp_server_to_fastapi_server
from setta.project_state.project_manager import ProjectManager
from setta.routers import (
    ai_router,
    artifact_router,
    code_info_router,
    interactive_code_router,
    lsp_router,
    projects_router,
    reference_renaming_router,
    sections_router,
    settings_router,
    terminals_router,
    websocket_router,
)
from setta.terminals.terminals import Terminals
from setta.utils.constants import C
from setta.utils.utils import get_absolute_path, is_dev_mode
from setta.websockets.script_metadata import ScriptMetadata
from setta.websockets.websocket_manager import WebsocketManager
from setta.websockets.websocket_msg_handlers import WebsocketMsgHandlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.settings_file = SettingsFile()
    app.state.lsps = LSPServers()
    app.state.lsp_writers = LSPWriters(app.state.lsps)
    app.state.websocket_manager = WebsocketManager()
    app.state.project_manager = ProjectManager(
        app.state.lsp_writers, app.state.websocket_manager
    )
    app.state.script_metadata = ScriptMetadata()
    app.state.dbq = DBQueue(
        C.DB_PATH,
    )
    maybe_create_tables_and_seed(
        app.state.dbq,
        with_examples=C.WITH_EXAMPLES,
        with_base_ui_types=True,
    )
    app.state.dbq.connect()

    app.state.specific_file_watcher = create_specific_file_watcher(
        app.state.websocket_manager
    )
    app.state.websocket_msg_handlers = WebsocketMsgHandlers(
        app.state.websocket_manager,
        app.state.lsp_writers,
        app.state.project_manager,
        app.state.script_metadata,
        app.state.dbq,
        app.state.specific_file_watcher,
    )
    app.state.terminals = Terminals(app.state.websocket_msg_handlers.terminals)

    app.state.lsp_readers = LSPReaders(app.state.lsps, app.state.project_manager)

    add_mcp_server_to_fastapi_server(app, "/mcp")
    app.state.mcp_client = MCPClient(
        f"{C.BACKEND}/mcp",
    )
    app.state.chat_manager = ChatManager(
        app.state.dbq,
        app.state.mcp_client,
        app.state.websocket_msg_handlers.chat_manager,
    )

    asyncio.create_task(app.state.mcp_client.connect_to_server())
    asyncio.create_task(
        start_lsps(app.state.lsps, app.state.lsp_readers, app.state.lsp_writers)
    )
    app.state.specific_file_watcher.start()

    if not is_dev_mode():
        # Mount the 'frontend/dist' directory at '/static'
        frontend_folder = Path("static/frontend")
        dist_path = get_absolute_path(__file__, frontend_folder)
        app.mount(
            "/static",
            StaticFiles(directory=dist_path, html=True),
            name="static",
        )

        # {full_path:path} is to catch all paths not explicitly covered here
        @app.get("/{full_path:path}", response_class=HTMLResponse)
        async def read_root(full_path: str):
            # Adjust the path to match the location of your 'index.html'
            with open(dist_path / "index.html") as f:
                content = f.read()
            return content

    print(f"Ready: {C.BACKEND}", flush=True)
    try:
        yield
    finally:
        app.state.project_manager.delete_temp_files()
        app.state.lsp_writers.file_watcher.stop()
        app.state.specific_file_watcher.stop()
        await app.state.mcp_client.stop()
        await stop_lsps(app.state.lsps, app.state.lsp_readers)


app = FastAPI(
    lifespan=lifespan,
    openapi_url=f"{C.ROUTE_PREFIX}{C.ROUTE_OPENAPI_DOCS}",
    docs_url=f"{C.ROUTE_PREFIX}{C.ROUTE_SWAGGER_DOCS}",
    redoc_url=f"{C.ROUTE_PREFIX}{C.ROUTE_REDOC_DOCS}",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=C.FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


kwargs = {"prefix": C.ROUTE_PREFIX}
app.include_router(projects_router, **kwargs)
app.include_router(sections_router, **kwargs)
app.include_router(terminals_router, **kwargs)
app.include_router(websocket_router, **kwargs)
app.include_router(code_info_router, **kwargs)
app.include_router(settings_router, **kwargs)
app.include_router(interactive_code_router, **kwargs)
app.include_router(artifact_router, **kwargs)
app.include_router(reference_renaming_router, **kwargs)
app.include_router(lsp_router, **kwargs)
app.include_router(ai_router, **kwargs)


# https://github.com/tiangolo/fastapi/issues/3361#issuecomment-1002120988
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logging.error(f"{request}: {exc_str}")
    content = {"status_code": 10422, "message": exc_str, "data": None}
    return JSONResponse(
        content=content, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
    )
