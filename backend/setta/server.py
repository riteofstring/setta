import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import setta.mcp.tools  # noqa: F401
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.lsp.managers import (
    LSPReaders,
    LSPServers,
    LSPWriters,
    start_lsps,
    stop_file_watcher,
    stop_lsps,
)
from setta.lsp.specific_file_watcher import create_specific_file_watcher
from setta.mcp.chat_manager import ChatManager
from setta.mcp.client import MCPClient
from setta.mcp.server import SettaFastMCP
from setta.project_state.project_manager import ProjectManager
from setta.routers import (
    ai_router,
    artifact_router,
    code_info_router,
    interactive_code_router,
    lsp_router,
    project_manager_router,
    projects_router,
    sections_router,
    settings_router,
    terminals_router,
    websocket_router,
)
from setta.terminals.terminals import Terminals
from setta.types.routes import Route
from setta.utils.constants import C
from setta.utils.utils import get_absolute_path, is_dev_mode
from setta.websockets.msg_handlers.cli import WMHCLIReceiver, WMHCLISender
from setta.websockets.msg_handlers.frontend import (
    WMHFrontendReceiver,
    WMHFrontendSender,
)
from setta.websockets.msg_handlers.python_logger import WMHPythonLoggerReceiver
from setta.websockets.msg_handlers.python_script import WMHPythonScriptReceiver
from setta.websockets.script_metadata import ScriptMetadata
from setta.websockets.websocket_manager import WebsocketManager

logger = logging.getLogger(__name__)


class SettaFastAPIState:
    def __init__(self):
        self.settings_file = SettingsFile()
        self.websocket_manager = WebsocketManager()
        self.lsps = LSPServers(self.settings_file.settings.languageServer)
        self.lsp_writers = LSPWriters(self.lsps)
        self.script_metadata = ScriptMetadata()
        self.dbe = DBE(C.DB_PATH)
        self.wmh_frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.wmh_cli_sender = WMHCLISender(self.websocket_manager)
        self.specific_file_watcher = create_specific_file_watcher(
            self.wmh_frontend_sender
        )
        self.project_manager = ProjectManager(
            self.lsp_writers,
            self.wmh_frontend_sender,
            self.settings_file,
            self.dbe,
        )
        self.wmh_frontend_receiver = WMHFrontendReceiver(
            self.websocket_manager,
            self.project_manager,
            self.script_metadata,
            self.specific_file_watcher,
        )
        self.wmh_cli_receiver = WMHCLIReceiver(self.websocket_manager)
        self.wmh_python_script_receiver = WMHPythonScriptReceiver(
            self.websocket_manager, self.script_metadata, self.project_manager
        )
        self.wmh_python_logger_receiver = WMHPythonLoggerReceiver(
            self.websocket_manager
        )

        self.lsp_readers = LSPReaders(self.lsps, self.wmh_frontend_sender)
        self.terminals = Terminals(self.wmh_frontend_sender, self.settings_file)

        self.mcp_server = SettaFastMCP(
            app,
            "/mcp",
            "Setta MCP Server",
            self.wmh_frontend_sender,
            self.dbe,
            self.terminals,
            self.project_manager,
        )
        self.mcp_client = MCPClient(
            f"{C.BACKEND}/mcp",
        )
        self.chat_manager = ChatManager(
            self.dbe, self.mcp_client, self.wmh_frontend_sender
        )

        asyncio.create_task(self.mcp_client.connect_to_server())
        asyncio.create_task(start_lsps(self.lsps, self.lsp_readers, self.lsp_writers))
        self.specific_file_watcher.start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.setta = SettaFastAPIState()

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
            with open(dist_path / "index.html") as f:
                content = f.read()
            return content

    print(f"Ready: {C.BACKEND}", flush=True)
    try:
        yield
    finally:
        app.state.setta.project_manager.delete_temp_folder()
        app.state.setta.specific_file_watcher.stop()
        await app.state.setta.mcp_client.stop()
        await stop_lsps(app.state.setta.lsps, app.state.setta.lsp_readers)
        stop_file_watcher(app.state.setta.lsp_writers)


app = FastAPI(
    lifespan=lifespan,
    openapi_url=f"{Route.PREFIX.value}{Route.OPENAPI_DOCS.value}",
    docs_url=f"{Route.PREFIX.value}{Route.SWAGGER_DOCS.value}",
    redoc_url=f"{Route.PREFIX.value}{Route.REDOC_DOCS.value}",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=C.FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


kwargs: dict[Literal["prefix"], str] = {"prefix": Route.PREFIX.value}
app.include_router(projects_router, **kwargs)
app.include_router(sections_router, **kwargs)
app.include_router(terminals_router, **kwargs)
app.include_router(websocket_router, **kwargs)
app.include_router(code_info_router, **kwargs)
app.include_router(settings_router, **kwargs)
app.include_router(interactive_code_router, **kwargs)
app.include_router(artifact_router, **kwargs)
app.include_router(lsp_router, **kwargs)
app.include_router(ai_router, **kwargs)
app.include_router(project_manager_router, **kwargs)


# https://github.com/tiangolo/fastapi/issues/3361#issuecomment-1002120988
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logger.error(f"{request}: {exc_str}")
    content = {"status_code": 10422, "message": exc_str, "data": None}
    return JSONResponse(
        content=content, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
    )
