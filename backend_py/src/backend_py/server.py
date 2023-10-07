import json
import re

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db.projects.load import load_all_projects, load_project
from .db.projects.save import save_project_details
from .schema import db
from .utils.utils import generate_memorable_string

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


class ProjectSaveRequest(BaseModel):
    project: dict


# https://fastapi.tiangolo.com/advanced/websockets/#handling-disconnections-and-multiple-clients
class ConnectionManager:
    def __init__(self):
        self.sockets = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        id = websocket.headers.get("websocketId")
        while (not id) or id in self.sockets:
            id = generate_memorable_string()
        self.sockets[id] = websocket
        await self.send_message(
            {"toWebsocketId": id, "messageType": "connection", "websocketId": id}
        )
        await self.broadcast_connections()
        return id

    async def disconnect(self, id):
        del self.sockets[id]
        await self.broadcast_connections()

    async def send_message(self, message):
        websocket = self.sockets[message["toWebsocketId"]]
        await websocket.send_text(json.dumps(message))

    async def broadcast(self, message):
        for websocket in self.sockets.values():
            await websocket.send_text(json.dumps(message))

    async def broadcast_connections(self):
        connections = []
        for id, s in self.sockets.items():
            connections.append({"websocketId": id, "isCLI": True})
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
            # await manager.send_personal_message(f"You wrote: {data}", websocket)
            # await manager.broadcast(f"Client #{client_id} says: {data}")
    except WebSocketDisconnect:
        await manager.disconnect(id)
        # await manager.broadcast(f"Client #{client_id} left the chat")


@app.post("/projects")
def route_projects(x: ProjectRequest):
    return load_all_projects(x.format)


@app.post("/projects/load/{projectName}/{configName}")
def route_load_project(projectName, configName):
    return load_project(projectName, configName)


@app.post("/projects/save")
def route_save_project(x: ProjectSaveRequest):
    save_project_details(x.project)


@app.post("/projects/createProject")
def route_create_project():
    pass


@app.post("/projects/saveAsNewProjectConfig")
def route_save_as_new_project_config():
    pass


@app.post("/projects/saveAsExistingProjectConfig")
def route_save_as_existing_project_config():
    pass


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
def route_set_project_name():
    pass


@app.post("/projects/setProjectConfigName")
def route_set_project_config_name():
    pass


@app.post("/auth/setDarkMode")
def route_set_dark_mode():
    pass


@app.post("/logging")
def route_logging():
    pass


@app.post("/sections")
def route_sections():
    pass
