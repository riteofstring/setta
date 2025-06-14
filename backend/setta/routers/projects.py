import traceback

from fastapi import BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from setta.database.backup import maybe_create_backup
from setta.database.db.notifications.delete import delete_notification
from setta.database.db.notifications.load import (
    load_project_notifications,
)
from setta.database.db.projects.save import (
    save_project_state,
)
from setta.database.db.projects.saveAs import (
    save_as_existing_project_config,
    save_as_new_project_config,
)
from setta.database.db_objs import DBE
from setta.database.export_db.export_db import maybe_export_database
from setta.database.settings_file import SettingsFile
from setta.project_state.project_manager import ProjectManager
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.helpers import (
    ProjectNameTaken,
    ProjectNotFound,
    confirm_config_name,
    convert_backend_to_single_config,
)
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.routes import Route
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler

from .dependencies import get_dbe, get_project_manager, get_settings_file, get_wmh_base

router = SettaAPIRouter()


class ProjectLoadRequest(BaseModel):
    projectConfigName: str


class ProjectSaveRequest(BaseModel):
    project: ProjectStateSingleConfig


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


@router.post(Route.LOAD_ALL_PROJECT_METADATA)
def route_load_all_project_metadata(
    project_manager: ProjectManager = Depends(get_project_manager),
):
    output = project_manager.get_project_metadata()
    return output


@router.post(Route.LOAD_PROJECT_CONFIG)
async def route_load_project_config(
    x: ProjectLoadRequest,
    project_manager: ProjectManager = Depends(get_project_manager),
) -> ProjectStateSingleConfig:
    try:
        projectState = project_manager.project_state_backend
        projectConfigId = confirm_config_name(projectState, x.projectConfigName)
        projectState = convert_backend_to_single_config(projectState, projectConfigId)
        await project_manager.maybe_init_project_config(projectState)
        return projectState
    except ProjectNotFound as e:
        print(f"[DEBUG] Project not found: {e}", flush=True)
        raise HTTPException(status_code=404, detail=repr(e))
    except Exception as e:
        print(f"[DEBUG] Unexpected error: {e}", flush=True)
        print(f"Exception details:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        print("[DEBUG] route_load_project_config finished", flush=True)


@router.post(Route.SAVE_PROJECT)
async def route_save_project(
    x: ProjectSaveRequest,
    background_tasks: BackgroundTasks,
    dbe: DBE = Depends(get_dbe),
    websocket_msg_handler: BaseWebsocketMsgHandler = Depends(get_wmh_base),
    settings_file: SettingsFile = Depends(get_settings_file),
    project_manager: ProjectManager = Depends(get_project_manager),
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
            await project_manager.update_from_frontend(None, x.project)
            save_project_state(db, project_manager.project_state_backend)
            maybe_export_database(
                db,
                dbe.path,
                settings.exportDbRawOnSave,
                settings.exportDbReadableOnSave,
                settings.exportDbReadableWithVariantsOnSave,
            )
            # Return success response with notification
            notification = SettaNotification(
                projectConfigId=x.project.projectConfig.id,
                message="Saved!",
                temporary=True,
            )

        except Exception:
            notification = SettaNotification(
                projectConfigId=x.project.projectConfig.id,
                message="Failed to save",
                type=SettaNotificationType.error,
                temporary=True,
            )

        background_tasks.add_task(
            websocket_msg_handler.broadcast_notification,
            notification,
        )


@router.post(Route.CREATE_PROJECT_CONFIG)
async def route_create_project_config(
    x: CreateProjectConfigRequest,
    dbe: DBE = Depends(get_dbe),
    project_manager: ProjectManager = Depends(get_project_manager),
):
    newProjectConfigName = await project_manager.create_project_config(
        x.previewImgColor
    )
    with dbe.session as db:
        save_project_state(db, project_manager.project_state_backend)
    return newProjectConfigName


@router.post(Route.SAVE_AS_NEW_PROJECT_CONFIG)
def route_save_as_new_project_config(
    x: SaveAsNewProjectConfigRequest, dbe=Depends(get_dbe)
):
    with dbe.session as db:
        return save_as_new_project_config(db, x.project, x.newConfigName, x.withRefs)


@router.post(Route.SAVE_AS_EXISTING_PROJECT_CONFIG)
def route_save_as_existing_project_config(
    x: SaveAsExistingProjectConfigRequest, dbe=Depends(get_dbe)
):
    with dbe.session as db:
        return save_as_existing_project_config(db, x.project, x.configName)


@router.post(Route.DELETE_PROJECT_CONFIGS)
async def route_delete_project_configs(
    x: DeleteProjectConfigsRequest,
    dbe: DBE = Depends(get_dbe),
    project_manager: ProjectManager = Depends(get_project_manager),
):
    await project_manager.delete_project_configs(x.ids)
    with dbe.session as db:
        save_project_state(db, project_manager.project_state_backend)
    return True


@router.post(Route.SET_PROJECT_CONFIG_NAME)
async def route_set_project_config_name(
    x: SetProjectConfigNameRequest,
    dbe: DBE = Depends(get_dbe),
    project_manager: ProjectManager = Depends(get_project_manager),
):
    try:
        await project_manager.set_project_config_name(x.projectConfigId, x.newName)
        with dbe.session as db:
            save_project_state(db, project_manager.project_state_backend)
    except ProjectNameTaken as e:
        raise HTTPException(status_code=422, detail=repr(e))


@router.post(Route.GET_DEFAULT_PROJECT_CONFIG_NAME)
def router_get_default_project_config_name(
    project_manager: ProjectManager = Depends(get_project_manager),
):
    return project_manager.get_default_project_config_name()


@router.post(Route.SET_AS_DEFAULT_PROJECT)
async def router_set_as_default_project(
    x: SetAsDefaultProjectRequest,
    dbe: DBE = Depends(get_dbe),
    project_manager: ProjectManager = Depends(get_project_manager),
):
    await project_manager.set_as_default_project(x.projectId)
    with dbe.session as db:
        save_project_state(db, project_manager.project_state_backend)


@router.post(Route.FILTER_DATA_FOR_JSON_EXPORT)
def router_filter_data_for_json_export(x: FilterDataForJSONExportRequest):
    filter_data_for_json_export(x.project)
    return x.project


@router.post(Route.ADD_DEFAULT_DATA_FOR_JSON_IMPORT)
def router_add_default_data_for_json_import(x: FilterDataForJSONExportRequest):
    add_defaults_to_project_and_load_json_sources(x.project)
    return x.project


@router.post(Route.GET_NOTIFICATIONS)
def route_get_notifications(
    x: GetNotificationsRequest, dbe: DBE = Depends(get_dbe)
) -> list[SettaNotification]:
    with dbe.session as db:
        notifications = load_project_notifications(db, x.projectConfigId)
        return notifications


@router.post(Route.DELETE_NOTIFICATION)
def route_delete_notification(x: DeleteNotificationRequest, dbe=Depends(get_dbe)):
    with dbe.session as db:
        success = delete_notification(db, x.notificationId)
        return {"success": success}
