import traceback

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from setta.database.backup import maybe_create_backup
from setta.database.db.notifications.delete import delete_notification
from setta.database.db.notifications.load import (
    load_project_notifications,
)
from setta.database.db.projects.delete import delete_project_configs
from setta.database.db.projects.load import (
    load_default_project_config_name,
    load_project_metadata,
    load_project_state,
)
from setta.database.db.projects.save import (
    ProjectNameTaken,
    create_project_config,
    save_project_config_name,
    save_project_state,
    set_as_default_project,
)
from setta.database.db.projects.saveAs import (
    save_as_existing_project_config,
    save_as_new_project_config,
)
from setta.database.db_objs import DBE
from setta.database.export_db.export_db import maybe_export_database
from setta.database.settings_file import SettingsFile
from setta.project_state.project_manager import ProjectManager
from setta.types.getters import ProjectNotFound, confirm_config_name
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_state import (
    ProjectLoadState,
    ProjectSaveState,
    ProjectUpdateState,
)
from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler

from .dependencies import get_dbe, get_project_manager, get_settings_file, get_wmh_base

router = APIRouter()


class ProjectLoadRequest(BaseModel):
    projectConfigName: str


class ProjectSaveRequest(BaseModel):
    project: ProjectSaveState


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
    projectConfigId: str
    newName: str


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
def route_load_all_project_metadata(dbe=Depends(get_dbe)):
    with dbe.session as db:
        return load_project_metadata(db)


@router.post(C.ROUTE_LOAD_PROJECT_CONFIG)
async def route_load_project_config(
    x: ProjectLoadRequest,
    dbe: DBE = Depends(get_dbe),
    project_manager: ProjectManager = Depends(get_project_manager),
):
    try:
        with dbe.session as db:
            if project_manager.project_is_loaded:
                projectState = project_manager.project_state
                projectConfigId = confirm_config_name(projectState, x.projectConfigName)
            else:
                projectState = load_project_state(db)
                projectConfigId = confirm_config_name(projectState, x.projectConfigName)
                projectUpdateState = ProjectUpdateState(
                    projectConfigId=projectConfigId, projectState=projectState
                )
                await project_manager.update(projectUpdateState)
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


@router.post(C.ROUTE_SAVE_PROJECT)
async def route_save_project(
    x: ProjectSaveRequest,
    background_tasks: BackgroundTasks,
    dbe: DBE = Depends(get_dbe),
    websocket_msg_handler: BaseWebsocketMsgHandler = Depends(get_wmh_base),
    settings_file: SettingsFile = Depends(get_settings_file),
):
    with dbe.session as db:
        notification = None
        try:
            # Perform existing save operations
            settings = settings_file.settings.backend
            maybe_create_backup(
                dbe.path,
                settings.autobackup,
                settings.autobackupFreq,
                settings.autobackupKeepLastN,
            )
            save_project_state(db, x.project.projectState)
            maybe_export_database(
                db,
                dbe.path,
                settings.exportDbRawOnSave,
                settings.exportDbReadableOnSave,
                settings.exportDbReadableWithVariantsOnSave,
            )
            # Return success response with notification
            notification = SettaNotification(
                projectConfigId=x.project.projectConfigId,
                message="Saved!",
                temporary=True,
            )

        except Exception:
            notification = SettaNotification(
                projectConfigId=x.project.projectConfigId,
                message="Failed to save",
                type=SettaNotificationType.error,
                temporary=True,
            )

        background_tasks.add_task(
            websocket_msg_handler.broadcast_notification,
            notification,
        )


@router.post(C.ROUTE_CREATE_PROJECT_CONFIG)
def route_create_project_config(x: CreateProjectConfigRequest, dbe=Depends(get_dbe)):
    with dbe.session as db:
        return create_project_config(db, x.previewImgColor)


@router.post(C.ROUTE_SAVE_AS_NEW_PROJECT_CONFIG)
def route_save_as_new_project_config(
    x: SaveAsNewProjectConfigRequest, dbe=Depends(get_dbe)
):
    with dbe.session as db:
        return save_as_new_project_config(db, x.project, x.newConfigName, x.withRefs)


@router.post(C.ROUTE_SAVE_AS_EXISTING_PROJECT_CONFIG)
def route_save_as_existing_project_config(
    x: SaveAsExistingProjectConfigRequest, dbe=Depends(get_dbe)
):
    with dbe.session as db:
        return save_as_existing_project_config(db, x.project, x.configName)


@router.post(C.ROUTE_DELETE_PROJECT_CONFIGS)
def route_delete_project_configs(x: DeleteProjectConfigsRequest, dbe=Depends(get_dbe)):
    with dbe.session as db:
        return delete_project_configs(db, x.ids)


@router.post(C.ROUTE_SET_PROJECT_CONFIG_NAME)
def route_set_project_config_name(x: SetProjectConfigNameRequest, dbe=Depends(get_dbe)):
    try:
        with dbe.session as db:
            save_project_config_name(db, x.projectConfigId, x.newName)
    except ProjectNameTaken as e:
        raise HTTPException(status_code=422, detail=repr(e))


@router.post(C.ROUTE_GET_DEFAULT_PROJECT_CONFIG_NAME)
def router_get_default_project_config_name(dbe=Depends(get_dbe)):
    with dbe.session as db:
        return load_default_project_config_name(db)


@router.post(C.ROUTE_SET_AS_DEFAULT_PROJECT)
def router_set_as_default_project(x: SetAsDefaultProjectRequest, dbe=Depends(get_dbe)):
    with dbe.session as db:
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
def route_get_notifications(x: GetNotificationsRequest, dbe=Depends(get_dbe)):
    with dbe.session as db:
        notifications = load_project_notifications(db, x.projectConfigId)
        return notifications


@router.post(C.ROUTE_DELETE_NOTIFICATION)
def route_delete_notification(x: DeleteNotificationRequest, dbe=Depends(get_dbe)):
    with dbe.session as db:
        success = delete_notification(db, x.notificationId)
        return {"success": success}
