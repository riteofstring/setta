import json
import re
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db.projects.load import load_all_projects, load_project
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
from .schema import db
from .utils.utils import convert_to_backend_format, generate_memorable_string

db.connect()
app = FastAPI()

origins = ["http://127.0.0.1:3000", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProjectRequest(BaseModel):
    format: str
    projectId: Optional[str]


class ProjectSaveRequest(BaseModel):
    project: dict


class SaveAsNewProjectConfigRequest(BaseModel):
    project: dict
    newConfigName: str


class SaveAsExistingProjectConfigRequest(BaseModel):
    project: dict
    configName: str


class CreateProjectRequest(BaseModel):
    name: Optional[str]


class SetProjectNameRequest(BaseModel):
    currProjectName: str
    newProjectName: str


class SetProjectConfigNameRequest(BaseModel):
    projectId: str
    currProjectConfigName: str
    newProjectConfigName: str


class SetDarkModeRequest(BaseModel):
    darkMode: bool


# https://fastapi.tiangolo.com/advanced/websockets/#handling-disconnections-and-multiple-clients
class ConnectionManager:
    def __init__(self):
        self.sockets = {}

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
        await self.broadcast_connections()
        return id

    async def disconnect(self, id):
        del self.sockets[id]
        await self.broadcast_connections()

    async def send_message(self, message, fromWebsocketId=None):
        if "toWebsocketId" in message:
            websocket = self.sockets[message["toWebsocketId"]]["websocket"]
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
            await manager.send_message(json.loads(data), id)
    except WebSocketDisconnect:
        await manager.disconnect(id)


@app.post("/projects")
def route_projects(x: ProjectRequest):
    return load_all_projects(x.format, x.projectId)


@app.post("/projects/load/{projectName}/{configName}")
def route_load_project(projectName, configName):
    return load_project(projectName, configName)


@app.post("/projects/save")
def route_save_project(x: ProjectSaveRequest):
    formatted = convert_to_backend_format(x.project)
    save_project_details(formatted)


@app.post("/projects/createProject")
def route_create_project(x: CreateProjectRequest):
    return create_project(x.name)


@app.post("/projects/saveAsNewProjectConfig")
def route_save_as_new_project_config(x: SaveAsNewProjectConfigRequest):
    return save_as_new_project_config(x.project, x.newConfigName)


@app.post("/projects/saveAsExistingProjectConfig")
def route_save_as_existing_project_config(x: SaveAsExistingProjectConfigRequest):
    return save_as_existing_project_config(x.project, x.configName)


@app.post("/codeInfo/getCollectionsAndModules")
def route_get_collections_and_modules():
    pass


@app.post("/codeInfo/saveCollections")
def route_save_collections():
    pass


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
    save_project_name(x.currProjectName, x.newProjectName)


@app.post("/projects/setProjectConfigName")
def route_set_project_config_name(x: SetProjectConfigNameRequest):
    save_project_config_name(
        x.projectId, x.currProjectConfigName, x.newProjectConfigName
    )


@app.post("/settings")
def route_load_settings():
    return load_settings()


@app.post("/settings/setDarkMode")
def route_set_dark_mode(x: SetDarkModeRequest):
    save_dark_mode(x.darkMode)


@app.post("/logging")
def route_logging():
    pass


@app.post("/sections")
def route_sections():
    pass
