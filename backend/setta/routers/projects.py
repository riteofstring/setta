import sqlite3
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from setta.database.db.projects.delete import delete_projects
from setta.database.db.projects.load import (
    load_all_projects,
    load_full_project,
    load_project,
)
from setta.database.db.projects.save import (
    create_project,
    save_project_details,
    save_project_name,
)
from setta.database.db.projects.saveAs import (
    save_as_existing_project_config,
    save_as_new_project_config,
)
from setta.utils.constants import C

from .dependencies import get_dbs

router = APIRouter()


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
    previewImgColor: str


class DeleteProjectsRequest(BaseModel):
    ids: List[str]


class SetProjectNameRequest(BaseModel):
    currProjectName: str
    newProjectName: str


class SetProjectConfigNameRequest(BaseModel):
    projectId: str
    currProjectConfigName: str
    newProjectConfigName: str


@router.post(C.ROUTE_PROJECTS)
def route_projects(dbs=Depends(get_dbs)):
    with dbs:
        return load_all_projects(dbs)


@router.post(C.ROUTE_LOAD_PROJECT)
def route_load_project(projectName, configName, dbs=Depends(get_dbs)):
    with dbs:
        return load_project(dbs, projectName, configName)


@router.post(C.ROUTE_LOAD_FULL_PROJCT)
def route_load_full_project(projectName, dbs=Depends(get_dbs)):
    with dbs:
        return load_full_project(dbs, projectName)


@router.post(C.ROUTE_SAVE_PROJECT)
def route_save_project(x: ProjectSaveRequest, dbs=Depends(get_dbs)):
    with dbs:
        save_project_details(dbs, x.project)


@router.post(C.ROUTE_CREATE_PROJECT)
def route_create_project(x: CreateProjectRequest, dbs=Depends(get_dbs)):
    with dbs:
        return create_project(dbs, x.name, x.previewImgColor)


@router.post(C.ROUTE_SAVE_AS_NEW_PROJECT_CONFIG)
def route_save_as_new_project_config(
    x: SaveAsNewProjectConfigRequest, dbs=Depends(get_dbs)
):
    with dbs:
        return save_as_new_project_config(dbs, x.project, x.newConfigName)


@router.post(C.ROUTE_SAVE_AS_EXISTING_PROJECT_CONFIG)
def route_save_as_existing_project_config(
    x: SaveAsExistingProjectConfigRequest, dbs=Depends(get_dbs)
):
    with dbs:
        return save_as_existing_project_config(dbs, x.project, x.configName)


@router.post(C.ROUTE_DELETE_PROJECTS)
def route_delete_projects(x: DeleteProjectsRequest, dbs=Depends(get_dbs)):
    with dbs:
        return delete_projects(dbs, x.ids)


@router.post(C.ROUTE_SET_PROJECT_NAME)
def route_set_project_name(x: SetProjectNameRequest, dbs=Depends(get_dbs)):
    try:
        with dbs:
            save_project_name(dbs, x.currProjectName, x.newProjectName)
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=422, detail=repr(e))


@router.post(C.ROUTE_SET_PROJECT_CONFIG_NAME)
def route_set_project_config_name(x: SetProjectConfigNameRequest, dbs=Depends(get_dbs)):
    try:
        with dbs:
            save_project_config_name(
                dbs, x.projectId, x.currProjectConfigName, x.newProjectConfigName
            )
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=422, detail=repr(e))
