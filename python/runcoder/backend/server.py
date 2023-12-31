import json
import os
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from runcoder.cli.web import getConsumerMessageAndSend
from runcoder.processors.processors import Processors
from runcoder.processors.utils import killMyPyDaemon, startMyPyDaemon
from runcoder.utils.cache import Cache
from runcoder.utils.tasks import Tasks
from runcoder.utils.utils import import_from_path

from .db.projects.delete import delete_projects
from .db.projects.load import load_all_projects, load_full_project, load_project
from .db.projects.save import (
    create_project,
    save_project_config_name,
    save_project_details,
    save_project_name,
)
from .db.projects.saveAs import (
    save_as_existing_project_config,
    save_as_new_project_config,
)
from .db.settings.load import load_settings
from .db.settings.save import save_dark_mode
from .db.uiTypes.load import load_base_uitypes
from .db_path import use_db
from .schema import dbq
from .utils.utils import convert_to_backend_format, generate_memorable_string
from .db.codeInfo.save import save_code_info

dev_mode = os.environ.get("RUNCODER_DEV_MODE")

origins = (
    ["http://127.0.0.1:3000", "http://localhost:3000"]
    if dev_mode
    else ["http://127.0.0.1:8000", "http://localhost:8000"]
)

app = FastAPI()
tasks_obj = Tasks()
cache = Cache()
processors = Processors()


@app.on_event("startup")
async def startup_event():
    db_alias = os.environ.get("RUNCODER_DB_ALIAS")
    if db_alias:
        use_db(db_alias)
    dbq.connect()
    if not dev_mode:
        # Mount the 'frontend/dist' directory at '/static'
        dist_path = Path(__file__).resolve().parent / ".." / "frontend"
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
    i_path = os.environ.get("RUNCODER_I_PATH")
    if i_path:
        i_args = import_from_path(i_path).RUNCODER
        processors.add_fn(i_args["project"], i_args["fn"])


@app.on_event("shutdown")
def shutdown_event():
    print("shutdown_event", flush=True)
    killMyPyDaemon()


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


class SetDarkModeRequest(BaseModel):
    darkMode: bool


class SaveCodeInfoRequest(BaseModel):
    codeInfo: dict



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


@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    id = await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print("received message", flush=True)
            await manager.send_message(json.loads(data), id)
    except WebSocketDisconnect:
        await manager.disconnect(id)


@app.post("/projects")
def route_projects(x: ProjectRequest):
    with dbq.get() as db:
        return load_all_projects(db, x.format, x.projectId)


@app.post("/projects/load/{projectName}/{configName}")
def route_load_project(projectName, configName):
    with dbq.get() as db:
        return load_project(db, projectName, configName)


@app.post("/projects/load/{projectName}")
def route_load_full_project(projectName):
    with dbq.get() as db:
        return load_full_project(db, projectName)


@app.post("/projects/save")
def route_save_project(x: ProjectSaveRequest):
    formatted = convert_to_backend_format(x.project)
    with dbq.get() as db:
        save_project_details(db, formatted)


@app.post("/projects/createProject")
def route_create_project(x: CreateProjectRequest):
    with dbq.get() as db:
        return create_project(db, x.name)


@app.post("/projects/saveAsNewProjectConfig")
def route_save_as_new_project_config(x: SaveAsNewProjectConfigRequest):
    with dbq.get() as db:
        return save_as_new_project_config(db, x.project, x.newConfigName)


@app.post("/projects/saveAsExistingProjectConfig")
def route_save_as_existing_project_config(x: SaveAsExistingProjectConfigRequest):
    with dbq.get() as db:
        return save_as_existing_project_config(db, x.project, x.configName)


@app.post("/projects/deleteProjects")
def route_delete_projects(x: DeleteProjectsRequest):
    with dbq.get() as db:
        return delete_projects(db, x.ids)


@app.post("/uiTypes/getBaseUITypes")
def route_get_base_uitypes():
    with dbq.get() as db:
        return load_base_uitypes(db)


@app.post("/codeInfo/getCollectionsAndModules")
def route_get_collections_and_modules():
    pass


@app.post("/codeInfo/save")
def route_save_code_info(x: SaveCodeInfoRequest):
    with dbq.get() as db:
        save_code_info(db, x.codeInfo)


@app.post("/codeInfo/getCollectionDetails")
def route_get_collection_details():
    pass


@app.post("/codeGenerator/generateCode")
def route_generate_code():
    pass


@app.post("/codeGenerator/getCode")
def route_get_code():
    pass


@app.post("/projects/setProjectName")
def route_set_project_name(x: SetProjectNameRequest):
    with dbq.get() as db:
        save_project_name(db, x.currProjectName, x.newProjectName)


@app.post("/projects/setProjectConfigName")
def route_set_project_config_name(x: SetProjectConfigNameRequest):
    with dbq.get() as db:
        save_project_config_name(
            db, x.projectId, x.currProjectConfigName, x.newProjectConfigName
        )


@app.post("/settings")
def route_load_settings():
    with dbq.get() as db:
        return load_settings(db)


@app.post("/settings/setDarkMode")
def route_set_dark_mode(x: SetDarkModeRequest):
    with dbq.get() as db:
        save_dark_mode(db, x.darkMode)


@app.post("/logging")
def route_logging():
    pass


@app.post("/sections")
def route_sections():
    pass
