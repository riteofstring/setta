import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from runcoder.database.db.codeInfo.save import save_code_info
from runcoder.database.db.settings.load import load_settings
from runcoder.database.db_init import maybe_create_tables_and_seed
from runcoder.database.db_objs import DBs
from runcoder.processors.processors import (
    InteractiveFns,
    getProcessorOutput,
    parametersRequest,
    textFieldCompletion,
    textFieldInitializeCode,
    typeCheckRequest,
)
from runcoder.processors.utils import killMyPyDaemon, startMyPyDaemon
from runcoder.routers.dependencies import get_dbs, get_tasks_and_cache
from runcoder.routers.projects import router as projects_router
from runcoder.routers.sections import router as sections_router
from runcoder.routers.terminals import router as terminals_router
from runcoder.routers.websocket import router as websocket_router
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
    app.state.tasks_obj = Tasks()
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


class SaveCodeInfoRequest(BaseModel):
    codeInfo: dict


class ParametersRequestRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    beforeText: str
    fullText: str
    position: int
    evRefs: list


class TextFieldInitializeCode(BaseModel):
    project: dict
    sectionId: str
    paramInfoId: str | None


class TypeCheckRequestRequest(BaseModel):
    project: dict


class TextFieldCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    beforeText: str
    fullText: str
    position: int
    evRefs: list


@app.post(C.ROUTE_GET_COLLECTIONS_AND_MODULES)
def route_get_collections_and_modules():
    pass


@app.post("/codeInfo/save")
def route_save_code_info(x: SaveCodeInfoRequest, dbs=Depends(get_dbs)):
    with dbs:
        save_code_info(dbs, x.codeInfo)


@app.post(C.ROUTE_GET_COLLECTION_DETAILS)
def route_get_collection_details():
    pass


@app.post(C.ROUTE_LOAD_SETTINGS)
def route_load_settings(dbs=Depends(get_dbs)):
    with dbs:
        return load_settings(dbs)


@app.post("/logging")
def route_logging():
    pass


@app.post(C.ROUTE_PARAMETERS_REQUEST)
async def route_parameters_request(
    x: ParametersRequestRequest, tasks_and_cache=Depends(get_tasks_and_cache)
):
    tasks_obj, cache = tasks_and_cache
    result = await getProcessorOutput(
        parametersRequest,
        {"message": x.dict()},
        tasks_obj,
        cache,
    )
    return result["output"]


@app.post(C.ROUTE_TEXT_FIELD_INITIALIZE_CODE)
async def route_text_field_initialize_code(
    x: TextFieldInitializeCode, tasks_and_cache=Depends(get_tasks_and_cache)
):
    tasks_obj, cache = tasks_and_cache
    result = await getProcessorOutput(
        textFieldInitializeCode,
        {"message": x.dict()},
        tasks_obj,
        cache,
    )
    return result["output"]


@app.post(C.ROUTE_TYPE_CHECK_REQUEST)
async def route_type_check_request(
    x: TypeCheckRequestRequest, tasks_and_cache=Depends(get_tasks_and_cache)
):
    tasks_obj, cache = tasks_and_cache
    result = await getProcessorOutput(
        typeCheckRequest,
        {"message": x.dict()},
        tasks_obj,
        cache,
    )
    return result["output"]


@app.post(C.ROUTE_TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: TextFieldCompletionRequest, tasks_and_cache=Depends(get_tasks_and_cache)
):
    tasks_obj, cache = tasks_and_cache
    result = await getProcessorOutput(
        textFieldCompletion,
        {"message": x.dict()},
        tasks_obj,
        cache,
    )
    print("textFieldCompletion", result["output"], flush=True)
    return result["output"]
