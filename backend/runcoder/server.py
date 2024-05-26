from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from runcoder.database.db_init import maybe_create_tables_and_seed
from runcoder.database.db_objs import DBs
from runcoder.processors.processors import InteractiveFns
from runcoder.processors.utils import killMyPyDaemon, startMyPyDaemon
from runcoder.routers import (
    code_info_router,
    misc_router,
    projects_router,
    sections_router,
    tasks_router,
    terminals_router,
    websocket_router,
)
from runcoder.terminals.terminals import TerminalWebsockets
from runcoder.utils.cache import Cache
from runcoder.utils.constants import C
from runcoder.utils.tasks import Tasks
from runcoder.utils.utils import get_absolute_path, import_from_path, is_dev_mode
from runcoder.utils.websocket_manager import WebsocketManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.terminal_websockets = TerminalWebsockets()
    app.state.tasks = Tasks()
    app.state.cache = Cache()
    app.state.interactive_fns = InteractiveFns()
    app.state.websocket_manager = WebsocketManager(app.state.interactive_fns)
    app.state.dbs = DBs(
        C.DB_SPECS,
        C.CREATE_IF_NOT_EXISTS,
    )

    maybe_create_tables_and_seed(
        app.state.dbs,
        with_example_projects=C.WITH_EXAMPLE_PROJECTS,
        with_base_ui_types=True,
        with_settings=True,
    )

    app.state.dbs.connect()

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

    startMyPyDaemon()
    i_path = C.I_PATH
    if i_path:
        i_args = import_from_path(i_path).RUNCODER
        app.state.interactive_fns.add_fn(i_args["project"], i_args["fn"])

    yield

    # shutdown
    print("shutdown_event", flush=True)
    killMyPyDaemon()
    app.state.terminal_websockets.delete_all_terminals()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=C.FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)
app.include_router(sections_router)
app.include_router(terminals_router)
app.include_router(websocket_router)
app.include_router(code_info_router)
app.include_router(tasks_router)
app.include_router(misc_router)
