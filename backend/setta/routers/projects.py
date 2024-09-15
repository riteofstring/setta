import sqlite3
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from setta.database.backup import maybe_create_backup
from setta.database.db.projects.delete import delete_project_configs
from setta.database.db.projects.load import (
    load_all_project_config_metadata,
    load_default_config_name,
    load_full_project,
    load_project_config,
    load_project_config_names,
)
from setta.database.db.projects.save import (
    create_project_config,
    save_project_config_name,
    save_project_details,
)
from setta.database.db.projects.saveAs import (
    save_as_existing_project_config,
    save_as_new_project_config,
)
from setta.utils.constants import C

from .dependencies import get_dbs

router = APIRouter()


class ProjectLoadRequest(BaseModel):
    projectConfigName: str


class ProjectLoadFullRequest(BaseModel):
    excludeProjectConfigName: str


class ProjectLoadConfigNamesRequest(BaseModel):
    excludeProjectConfigName: str


class ProjectSaveRequest(BaseModel):
    project: dict


class SaveAsNewProjectConfigRequest(BaseModel):
    project: dict
    newConfigName: str
    withRefs: bool


class SaveAsExistingProjectConfigRequest(BaseModel):
    project: dict
    configName: str


class CreateProjectConfigRequest(BaseModel):
    name: Optional[str] = None
    previewImgColor: str


class DeleteProjectConfigsRequest(BaseModel):
    ids: List[str]


class SetProjectConfigNameRequest(BaseModel):
    currProjectConfigName: str
    newProjectConfigName: str


@router.post(C.ROUTE_ALL_PROJECT_CONFIG_METADATA)
def route_all_project_config_metadata(dbs=Depends(get_dbs)):
    with dbs:
        return load_all_project_config_metadata(dbs)


@router.post(C.ROUTE_LOAD_PROJECT_CONFIG_NAMES)
def route_load_project_config_names(dbs=Depends(get_dbs)):
    with dbs:
        return load_project_config_names(dbs)


@router.post(C.ROUTE_LOAD_PROJECT_CONFIG)
def route_load_project_config(
    x: ProjectLoadRequest,
    dbs=Depends(get_dbs),
):
    with dbs:
        return load_project_config(dbs, x.projectConfigName)


@router.post(C.ROUTE_LOAD_FULL_PROJECT)
def route_load_full_project(x: ProjectLoadFullRequest, dbs=Depends(get_dbs)):
    with dbs:
        return load_full_project(
            dbs, excludeProjectConfigName=x.excludeProjectConfigName
        )


@router.post(C.ROUTE_SAVE_PROJECT)
def route_save_project(x: ProjectSaveRequest, dbs=Depends(get_dbs)):
    with dbs:
        maybe_create_backup(dbs.default.path)
        save_project_details(dbs, x.project)


@router.post(C.ROUTE_CREATE_PROJECT_CONFIG)
def route_create_project_config(x: CreateProjectConfigRequest, dbs=Depends(get_dbs)):
    with dbs:
        return create_project_config(dbs, x.name, x.previewImgColor)


@router.post(C.ROUTE_SAVE_AS_NEW_PROJECT_CONFIG)
def route_save_as_new_project_config(
    x: SaveAsNewProjectConfigRequest, dbs=Depends(get_dbs)
):
    with dbs:
        return save_as_new_project_config(dbs, x.project, x.newConfigName, x.withRefs)


@router.post(C.ROUTE_SAVE_AS_EXISTING_PROJECT_CONFIG)
def route_save_as_existing_project_config(
    x: SaveAsExistingProjectConfigRequest, dbs=Depends(get_dbs)
):
    with dbs:
        return save_as_existing_project_config(dbs, x.project, x.configName)


@router.post(C.ROUTE_DELETE_PROJECT_CONFIGS)
def route_delete_project_configs(x: DeleteProjectConfigsRequest, dbs=Depends(get_dbs)):
    with dbs:
        return delete_project_configs(dbs, x.ids)


@router.post(C.ROUTE_SET_PROJECT_CONFIG_NAME)
def route_set_project_config_name(x: SetProjectConfigNameRequest, dbs=Depends(get_dbs)):
    try:
        with dbs:
            save_project_config_name(
                dbs, x.currProjectConfigName, x.newProjectConfigName
            )
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=422, detail=repr(e))


@router.post(C.ROUTE_GET_DEFAULT_CONFIG_NAME)
def router_get_default_config_name(dbs=Depends(get_dbs)):
    with dbs:
        return load_default_config_name(dbs)
