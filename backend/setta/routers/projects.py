import sqlite3
import traceback

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from setta.database.backup import maybe_create_backup
from setta.database.db.notifications.delete import delete_notification
from setta.database.db.notifications.load import (
    create_notification_dict,
    load_project_notifications,
)
from setta.database.db.projects.load import (
    ProjectNotFound,
    create_project_config,
    load_default_project_config_name,
    load_project_metadata,
    load_project_state_and_confirm_config_name,
)
from setta.database.db.projects.saveAs import (
    save_as_existing_project_config,
    save_as_new_project_config,
)
from setta.database.export_db.export_db import maybe_export_database
from setta.project_state.project_manager import ProjectManager
from setta.project_state.project_state import ProjectLoadState, ProjectUpdateState
from setta.utils.constants import C

from .dependencies import get_dbq, get_project_manager, get_wmh_base

router = APIRouter()


class ProjectLoadRequest(BaseModel):
    projectConfigName: str


class ProjectLoadFullRequest(BaseModel):
    excludeProjectConfigName: str | None = None


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
    previewImgColor: str


class DeleteProjectConfigsRequest(BaseModel):
    ids: list[str]


class SetProjectConfigNameRequest(BaseModel):
    currProjectConfigName: str
    newProjectConfigName: str


class SetAsDefaultProjectRequest(BaseModel):
    projectId: str


class FilterDataForJSONExportRequest(BaseModel):
    project: dict


class AddDefaultDataForJSONImportRequest(BaseModel):
    project: dict


class GetNotificationsRequest(BaseModel):
    projectConfigId: str


class DeleteNotificationRequest(BaseModel):
    notificationId: str


@router.post(C.ROUTE_LOAD_ALL_PROJECT_METADATA)
def route_load_all_project_metadata(dbq=Depends(get_dbq)):
    with dbq as db:
        return load_project_metadata(db)


@router.post(C.ROUTE_LOAD_PROJECT_CONFIG_NAMES)
def route_load_project_config_names(dbq=Depends(get_dbq)):
    with dbq as db:
        return load_project_config_names(db)


@router.post(C.ROUTE_LOAD_PROJECT_CONFIG)
async def route_load_project_config(
    x: ProjectLoadRequest,
    dbq=Depends(get_dbq),
    project_manager: ProjectManager = Depends(get_project_manager),
):
    try:
        with dbq as db:
            projectConfigId, projectState = load_project_state_and_confirm_config_name(
                db, x.projectConfigName
            )
            projectUpdateState = ProjectUpdateState(
                projectConfigId=projectConfigId, projectState=projectState
            )
            await project_manager.update(projectUpdateState, projectConfigId)
            return ProjectLoadState(
                projectConfigId=projectConfigId, projectState=projectState
            )
    except ProjectNotFound as e:
        print(f"[DEBUG] Project not found: {e}", flush=True)
        raise HTTPException(status_code=404, detail=repr(e))
    except Exception as e:
        print(f"[DEBUG] Unexpected error: {e}", flush=True)
        print(f"Exception details:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        print("[DEBUG] route_load_project_config finished", flush=True)


@router.post(C.ROUTE_LOAD_FULL_PROJECT)
def route_load_full_project(x: ProjectLoadFullRequest, dbq=Depends(get_dbq)):
    with dbq as db:
        return load_full_project(
            db, excludeProjectConfigName=x.excludeProjectConfigName
        )


@router.post(C.ROUTE_SAVE_PROJECT)
async def route_save_project(
    x: ProjectSaveRequest,
    background_tasks: BackgroundTasks,
    dbq=Depends(get_dbq),
    websocket_msg_handler=Depends(get_wmh_base),
):
    with dbq as db:
        notification = None
        try:
            # Perform existing save operations
            maybe_create_backup(db.path)
            save_project_details(db, x.project)
            maybe_export_database(db, db.path)
            # Return success response with notification
            notification = create_notification_dict(message="Saved!", temporary=True)

        except Exception:
            notification = create_notification_dict(
                message="Failed to save", type=C.NOTIFICATION_TYPE_ERROR, temporary=True
            )

        background_tasks.add_task(
            websocket_msg_handler.broadcast_notification,
            notification,
            x.project["projectConfig"]["id"],
        )


@router.post(C.ROUTE_CREATE_PROJECT_CONFIG)
def route_create_project_config(x: CreateProjectConfigRequest, dbq=Depends(get_dbq)):
    with dbq as db:
        return create_project_config(db, x.previewImgColor)


@router.post(C.ROUTE_SAVE_AS_NEW_PROJECT_CONFIG)
def route_save_as_new_project_config(
    x: SaveAsNewProjectConfigRequest, dbq=Depends(get_dbq)
):
    with dbq as db:
        return save_as_new_project_config(db, x.project, x.newConfigName, x.withRefs)


@router.post(C.ROUTE_SAVE_AS_EXISTING_PROJECT_CONFIG)
def route_save_as_existing_project_config(
    x: SaveAsExistingProjectConfigRequest, dbq=Depends(get_dbq)
):
    with dbq as db:
        return save_as_existing_project_config(db, x.project, x.configName)


@router.post(C.ROUTE_DELETE_PROJECT_CONFIGS)
def route_delete_project_configs(x: DeleteProjectConfigsRequest, dbq=Depends(get_dbq)):
    with dbq as db:
        return delete_project_configs(db, x.ids)


@router.post(C.ROUTE_SET_PROJECT_CONFIG_NAME)
def route_set_project_config_name(x: SetProjectConfigNameRequest, dbq=Depends(get_dbq)):
    try:
        with dbq as db:
            save_project_config_name(
                db, x.currProjectConfigName, x.newProjectConfigName
            )
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=422, detail=repr(e))


@router.post(C.ROUTE_GET_DEFAULT_PROJECT_CONFIG_NAME)
def router_get_default_project_config_name(dbq=Depends(get_dbq)):
    with dbq as db:
        return load_default_project_config_name(db)


@router.post(C.ROUTE_SET_AS_DEFAULT_PROJECT)
def router_set_as_default_project(x: SetAsDefaultProjectRequest, dbq=Depends(get_dbq)):
    with dbq as db:
        set_as_default_project(db, x.projectId)


@router.post(C.ROUTE_FILTER_DATA_FOR_JSON_EXPORT)
def router_filter_data_for_json_export(x: FilterDataForJSONExportRequest):
    filter_data_for_json_export(x.project)
    return x.project


@router.post(C.ROUTE_ADD_DEFAULT_DATA_FOR_JSON_IMPORT)
def router_add_default_data_for_json_import(x: FilterDataForJSONExportRequest):
    add_defaults_to_project_and_load_json_sources(x.project)
    return x.project


@router.post(C.ROUTE_GET_NOTIFICATIONS)
def route_get_notifications(x: GetNotificationsRequest, dbq=Depends(get_dbq)):
    with dbq as db:
        notifications = load_project_notifications(db, x.projectConfigId)
        return notifications


@router.post(C.ROUTE_DELETE_NOTIFICATION)
def route_delete_notification(x: DeleteNotificationRequest, dbq=Depends(get_dbq)):
    with dbq as db:
        success = delete_notification(db, x.notificationId)
        return {"success": success}
