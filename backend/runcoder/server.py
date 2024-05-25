import asyncio
import json
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from runcoder.cli.web import getConsumerMessageAndSend
from runcoder.database.db.codeInfo.save import save_code_info
from runcoder.database.db.projects.delete import delete_projects
from runcoder.database.db.projects.load import (
    load_all_projects,
    load_full_project,
    load_project,
)
from runcoder.database.db.projects.save import (
    create_project,
    save_project_config_name,
    save_project_details,
    save_project_name,
)
from runcoder.database.db.projects.saveAs import (
    save_as_existing_project_config,
    save_as_new_project_config,
)
from runcoder.database.db.sections.copy import (
    copy_relative_positions,
    copy_sections_and_other_info,
)
from runcoder.database.db.settings.load import load_settings
from runcoder.database.db.uiTypes.load import load_base_uitypes
from runcoder.database.db_init import maybe_create_tables_and_seed
from runcoder.database.db_objs import DBs
from runcoder.database.utils import convert_to_backend_format, generate_memorable_string
from runcoder.processors.processors import Processors, getProcessorOutput
from runcoder.processors.utils import killMyPyDaemon, startMyPyDaemon
from runcoder.terminals.terminals import TerminalWebsockets
from runcoder.utils.cache import Cache
from runcoder.utils.constants import C
from runcoder.utils.tasks import Tasks
from runcoder.utils.utils import (
    get_absolute_path,
    import_from_path,
    is_dev_mode,
    obj_to_dict,
)

origins = C.FRONTEND_ORIGINS
app = FastAPI()
tasks_obj = Tasks()
cache = Cache()
processors = Processors()
dbs = DBs(
    C.DB_SPECS,
    C.CREATE_IF_NOT_EXISTS,
)
maybe_create_tables_and_seed(
    dbs,
    with_example_projects=C.WITH_EXAMPLE_PROJECTS,
    with_base_ui_types=True,
    with_settings=True,
)


@app.on_event("startup")
async def startup_event():
    dbs.connect()
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
        processors.add_fn(i_args["project"], i_args["fn"])


@app.on_event("shutdown")
def shutdown_event():
    print("shutdown_event", flush=True)
    killMyPyDaemon()
    terminal_websockets.delete_all_terminals()


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProjectRequest(BaseModel):
    format: str
    projectId: Optional[str] = None


class ProjectSaveRequest(BaseModel):
    project: dict


class LoadFullProjectRequest(BaseModel):
    withBaseUITypes: bool


class SaveAsNewProjectConfigRequest(BaseModel):
    project: dict
    newConfigName: str


class SaveAsExistingProjectConfigRequest(BaseModel):
    project: dict
    configName: str


class CreateProjectRequest(BaseModel):
    name: Optional[str] = None


class DeleteProjectsRequest(BaseModel):
    ids: List[str]


class SetProjectNameRequest(BaseModel):
    currProjectName: str
    newProjectName: str


class SetProjectConfigNameRequest(BaseModel):
    projectId: str
    currProjectConfigName: str
    newProjectConfigName: str


class SaveCodeInfoRequest(BaseModel):
    codeInfo: dict


class SectionsMakeCopyRequest(BaseModel):
    sectionsAndOtherInfo: dict


class DeleteTerminalsRequest(BaseModel):
    ids: List[str]


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


# https://fastapi.tiangolo.com/advanced/websockets/#handling-disconnections-and-multiple-clients
class ConnectionManager:
    def __init__(self):
        self.sockets = {}
        self.use_server_as_cli = True
        self.server_cli_name = "main"

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        id = websocket.headers.get("websocketId")
        while (not id) or id in self.sockets:
            id = generate_memorable_string()
        isCLI = "Python" in websocket.headers.get("user-agent", "")
        self.sockets[id] = {"websocket": websocket, "isCLI": isCLI}
        await self.send_message(
            {"toWebsocketId": id, "messageType": "connection", "websocketId": id}
        )
        await self.send_message(
            {
                "toWebsocketId": id,
                "messageType": "interactiveProjects",
                "websocketId": id,
                "message": list(processors.interactive_projects),
            }
        )
        await self.broadcast_connections()
        return id

    async def disconnect(self, id):
        del self.sockets[id]
        await self.broadcast_connections()

    async def send_message(self, message, fromWebsocketId=None):
        if "toWebsocketId" in message:
            wid = message["toWebsocketId"]
            if wid == self.server_cli_name:
                websocket = self.sockets[fromWebsocketId]["websocket"]
                message["websocketId"] = wid
                await tasks_obj.create_task(
                    message.get("id", None),
                    getConsumerMessageAndSend(
                        message, websocket.send_text, tasks_obj, cache, processors
                    ),
                )
            else:
                websocket = self.sockets[wid]["websocket"]
                await websocket.send_text(
                    json.dumps({**message, "websocketId": fromWebsocketId})
                )

    async def broadcast(self, message):
        for s in self.sockets.values():
            await s["websocket"].send_text(json.dumps(message))

    async def broadcast_connections(self):
        connections = []
        for id, s in self.sockets.items():
            connections.append({"websocketId": id, "isCLI": s["isCLI"]})
        if self.use_server_as_cli:
            connections.append({"websocketId": self.server_cli_name, "isCLI": True})
        await self.broadcast(
            {"messageType": "allConnections", "connections": connections}
        )


manager = ConnectionManager()
terminal_websockets = TerminalWebsockets()


@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    print("regular websocket", websocket)
    id = await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print("received message", flush=True)
            await manager.send_message(json.loads(data), id)
    except WebSocketDisconnect:
        await manager.disconnect(id)


@app.websocket(C.ROUTE_TERMINAL)
async def terminal_websocket_endpoint(
    websocket: WebSocket, projectConfigId: str, id: str
):
    await terminal_websockets.connect(websocket, projectConfigId, id)
    try:
        # Start reading from and writing to the terminal
        read_task = terminal_websockets.loop.create_task(
            terminal_websockets.read_from_terminal(id)
        )
        write_task = terminal_websockets.loop.create_task(
            terminal_websockets.write_to_terminal(websocket, id)
        )

        # Wait for either task to complete
        _, pending = await asyncio.wait(
            [read_task, write_task], return_when=asyncio.FIRST_COMPLETED
        )

        # Cancel the remaining tasks
        for task in pending:
            task.cancel()
            await task  # Ensure task is properly cancelled
    finally:
        # Cleanup
        terminal_websockets.disconnect(websocket, id)


@app.post(C.ROUTE_PROJECTS)
def route_projects(x: ProjectRequest):
    with dbs:
        return load_all_projects(dbs, x.format, x.projectId)


@app.post(C.ROUTE_LOAD_PROJECT)
def route_load_project(projectName, configName):
    with dbs:
        return load_project(dbs, projectName, configName)


@app.post(C.ROUTE_LOAD_FULL_PROJCT)
def route_load_full_project(projectName, body):
    with dbs:
        return load_full_project(dbs, projectName, body)


@app.post(C.ROUTE_SAVE_PROJECT)
def route_save_project(x: ProjectSaveRequest):
    formatted = convert_to_backend_format(x.project)
    with dbs:
        save_project_details(dbs, formatted)


@app.post(C.ROUTE_CREATE_PROJECT)
def route_create_project(x: CreateProjectRequest):
    with dbs:
        return create_project(dbs, x.name)


@app.post(C.ROUTE_SAVE_AS_NEW_PROJECT_CONFIG)
def route_save_as_new_project_config(x: SaveAsNewProjectConfigRequest):
    with dbs:
        return save_as_new_project_config(dbs, x.project, x.newConfigName)


@app.post(C.ROUTE_SAVE_AS_EXISTING_PROJECT_CONFIG)
def route_save_as_existing_project_config(x: SaveAsExistingProjectConfigRequest):
    with dbs:
        return save_as_existing_project_config(dbs, x.project, x.configName)


@app.post(C.ROUTE_DELETE_PROJECTS)
def route_delete_projects(x: DeleteProjectsRequest):
    with dbs:
        return delete_projects(dbs, x.ids)


@app.post("/uiTypes/getBaseUITypes")
def route_get_base_uitypes():
    with dbs:
        return load_base_uitypes(dbs)


@app.post(C.ROUTE_GET_COLLECTIONS_AND_MODULES)
def route_get_collections_and_modules():
    pass


@app.post("/codeInfo/save")
def route_save_code_info(x: SaveCodeInfoRequest):
    with dbs:
        save_code_info(dbs, x.codeInfo)


@app.post(C.ROUTE_GET_COLLECTION_DETAILS)
def route_get_collection_details():
    pass


@app.post(C.ROUTE_SET_PROJECT_NAME)
def route_set_project_name(x: SetProjectNameRequest):
    with dbs:
        save_project_name(dbs, x.currProjectName, x.newProjectName)


@app.post(C.ROUTE_SET_PROJECT_CONFIG_NAME)
def route_set_project_config_name(x: SetProjectConfigNameRequest):
    with dbs:
        save_project_config_name(
            dbs, x.projectId, x.currProjectConfigName, x.newProjectConfigName
        )


@app.post(C.ROUTE_LOAD_SETTINGS)
def route_load_settings():
    with dbs:
        return load_settings(dbs)


@app.post("/logging")
def route_logging():
    pass


@app.post(C.ROUTE_SECTIONS)
def route_sections():
    pass


@app.post("/sections/makeCopy")
def route_sections_make_copy(x: SectionsMakeCopyRequest):
    output = copy_sections_and_other_info(x.sectionsAndOtherInfo)
    relativePositions = copy_relative_positions(
        x.sectionsAndOtherInfo["relativePositions"], output["section_id_map"]
    )
    output.pop("section_id_map")
    return {**output, "relativePositions": relativePositions}


@app.post(C.ROUTE_GET_FREE_TERMINAL)
def route_terminal_get_free_terminal(projectConfigId):
    return terminal_websockets.get_free_terminal(projectConfigId)


@app.post(C.ROUTE_DELETE_TERMINALS)
def route_terminal_delete_terminals(x: DeleteTerminalsRequest):
    terminal_websockets.delete_terminals(x.ids)


@app.post(C.ROUTE_PARAMETERS_REQUEST)
async def route_parameters_request(x: ParametersRequestRequest):
    result = await getProcessorOutput(
        {"messageType": "parametersRequest", "message": x.dict()},
        tasks_obj,
        cache,
        processors,
    )
    return result["output"]


@app.post(C.ROUTE_TEXT_FIELD_INITIALIZE_CODE)
async def route_text_field_initialize_code(x: TextFieldInitializeCode):
    result = await getProcessorOutput(
        {"messageType": "textFieldInitializeCode", "message": x.dict()},
        tasks_obj,
        cache,
        processors,
    )
    return result["output"]


@app.post(C.ROUTE_TYPE_CHECK_REQUEST)
async def route_type_check_request(x: TypeCheckRequestRequest):
    result = await getProcessorOutput(
        {"messageType": "typeCheckRequest", "message": x.project},
        tasks_obj,
        cache,
        processors,
    )
    return result["output"]


@app.post(C.ROUTE_TEXT_FIELD_COMPLETION)
async def route_text_field_completion(x: TextFieldCompletionRequest):
    result = await getProcessorOutput(
        {"messageType": "textFieldCompletion", "message": x.dict()},
        tasks_obj,
        cache,
        processors,
    )
    print("textFieldCompletion", result["output"], flush=True)
    return result["output"]
