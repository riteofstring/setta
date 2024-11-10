import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from setta.database.db_init import maybe_create_tables_and_seed
from setta.database.db_objs import DBQueue
from setta.database.settings_file import SettingsFile
from setta.lsp.reader import LanguageServerReader
from setta.lsp.server import LanguageServer
from setta.lsp.writer import LanguageServerWriter
from setta.routers import (
    artifact_router,
    code_info_router,
    interactive_code_router,
    projects_router,
    sections_router,
    settings_router,
    terminals_router,
    websocket_router,
)
from setta.tasks.tasks import Tasks
from setta.terminals.terminals import TerminalWebsockets
from setta.utils.constants import CODE_FOLDER, USER_SETTINGS, C
from setta.utils.utils import get_absolute_path, is_dev_mode
from setta.utils.websocket_manager import WebsocketManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.settings_file = SettingsFile(C.SETTINGS_PATH, C.CREATE_IF_NOT_EXISTS)
    app.state.lsp = LanguageServer(
        workspace_folder=Path(os.getcwd()),
        code_folder=Path(os.getcwd()) / CODE_FOLDER / "timestamped_folder",
        settings=USER_SETTINGS["languageServerSettings"],
    )
    app.state.basic_lsp = LanguageServer(
        workspace_folder=Path(os.getcwd()) / CODE_FOLDER / "timestamped_folder",
        code_folder=Path(os.getcwd()) / CODE_FOLDER / "timestamped_folder",
        settings={}
    )
    app.state.lsp_writer = LanguageServerWriter(app.state.lsp)
    app.state.basic_lsp_writer = LanguageServerWriter(app.state.basic_lsp)
    app.state.tasks = Tasks(app.state.lsp_writer, app.state.basic_lsp_writer)
    app.state.terminal_websockets = TerminalWebsockets()
    app.state.websocket_manager = WebsocketManager(app.state.tasks)
    app.state.lsp_reader = LanguageServerReader(
        app.state.lsp, app.state.websocket_manager
    )
    app.state.basic_lsp_reader = LanguageServerReader(
        app.state.basic_lsp, app.state.websocket_manager
    )
    app.state.dbq = DBQueue(
        C.DB_PATH,
        C.CREATE_IF_NOT_EXISTS,
    )

    maybe_create_tables_and_seed(
        app.state.dbq,
        with_examples=C.WITH_EXAMPLES,
        with_base_ui_types=True,
    )

    app.state.dbq.connect()
    await app.state.lsp.start_server()
    await app.state.lsp_reader.start_listener()
    await app.state.lsp_writer.send_initialize_request()
    await app.state.basic_lsp.start_server()
    await app.state.basic_lsp_reader.start_listener()
    await app.state.basic_lsp_writer.send_initialize_request()

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
            print("full_path", full_path)
            # Adjust the path to match the location of your 'index.html'
            with open(dist_path / "index.html") as f:
                content = f.read()
            return content

    try:
        yield
    finally:
        app.state.lsp_reader.stop_event.set()
        app.state.lsp.kill_server()
        app.state.basic_lsp_reader.stop_event.set()
        app.state.basic_lsp.kill_server()
        print("******FINISHED CLEANUP*******")


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


# https://github.com/tiangolo/fastapi/issues/3361#issuecomment-1002120988
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logging.error(f"{request}: {exc_str}")
    content = {"status_code": 10422, "message": exc_str, "data": None}
    return JSONResponse(
        content=content, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
    )
