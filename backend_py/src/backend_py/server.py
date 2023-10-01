from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db.projects.load import load_all_projects
from .schema import db

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


@app.post("/projects")
def route_projects(x: ProjectRequest):
    load_all_projects(x.format)
    return []


@app.post("/projects/load/{projectName}/{configName}")
def route_load_project():
    pass


@app.post("/projects/save")
def route_save_project():
    pass


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
