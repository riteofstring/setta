import traceback

from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel

from setta.database.db.notifications.delete import delete_notification
from setta.database.db.notifications.load import (
    load_project_notifications,
)
from setta.database.db.projects.saveAs import (
    save_as_existing_project_config,
    save_as_new_project_config,
)
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.helpers import (
    ProjectNameTaken,
    ProjectNotFound,
    convert_backend_to_single_config,
)
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_manager_types import (
    ProjectStateSingleConfigWithModCount,
    UpdateFromFrontendRequest,
)
from setta.types.project_state import ProjectMetadata
from setta.types.routes import Route

router = SettaAPIRouter()


class ProjectLoadRequest(BaseModel):
    projectConfigName: str


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
def route_load_all_project_metadata(state: AppStateFromRequest) -> ProjectMetadata:
    output = state.project_manager_switcher.main.get_project_metadata()
    return output


@router.post(Route.LOAD_PROJECT_CONFIG)
async def route_load_project_config(
    x: ProjectLoadRequest, state: AppStateFromRequest
) -> ProjectStateSingleConfigWithModCount:
    try:
        projectConfigId = state.project_manager_switcher.get_config_id_by_name(
            x.projectConfigName
        )
        project_manager = state.project_manager_switcher.get(projectConfigId)
        projectState = convert_backend_to_single_config(
            project_manager.project_state_backend, projectConfigId
        )
        return await project_manager.maybe_init_project_config(projectState)
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
    x: ProjectStateSingleConfigWithModCount,
    background_tasks: BackgroundTasks,
    state: AppStateFromRequest,
):
    try:
        req = UpdateFromFrontendRequest(
            projectState=x.projectState, modCount=x.modCount
        )
        project_manager = state.project_manager_switcher.get(x.projectState)
        update_success = await project_manager.update_from_frontend(
            req, trigger_autosave=False, updateFileWatcher=False
        )
        if not update_success:
            notification = SettaNotification(
                projectConfigId=x.projectState.projectConfig.id,
                message="Save failed due to update conflict",
            )
        else:
            project_manager.save()
            notification = SettaNotification(
                projectConfigId=x.projectState.projectConfig.id,
                message="Saved!",
            )

    except Exception:
        notification = SettaNotification(
            projectConfigId=x.projectState.projectConfig.id,
            message="Failed to save",
            type=SettaNotificationType.error,
        )

    background_tasks.add_task(
        state.wmh_frontend_sender.broadcast_notification,
        notification,
    )


@router.post(Route.CREATE_PROJECT_CONFIG)
async def route_create_project_config(
    x: CreateProjectConfigRequest, state: AppStateFromRequest
) -> str:
    project_manager = state.project_manager_switcher.main
    newProjectConfigName = await project_manager.create_project_config(
        x.previewImgColor
    )
    project_manager.save()
    return newProjectConfigName


# TODO
@router.post(Route.SAVE_AS_NEW_PROJECT_CONFIG)
def route_save_as_new_project_config(
    x: SaveAsNewProjectConfigRequest, state: AppStateFromRequest
):
    with state.dbe.session as db:
        return save_as_new_project_config(db, x.project, x.newConfigName, x.withRefs)


# TODO
@router.post(Route.SAVE_AS_EXISTING_PROJECT_CONFIG)
def route_save_as_existing_project_config(
    x: SaveAsExistingProjectConfigRequest, state: AppStateFromRequest
):
    with state.dbe.session as db:
        return save_as_existing_project_config(db, x.project, x.configName)


@router.post(Route.DELETE_PROJECT_CONFIGS)
async def route_delete_project_configs(
    x: DeleteProjectConfigsRequest, state: AppStateFromRequest
):
    project_manager = state.project_manager_switcher.main
    await project_manager.delete_project_configs(x.ids)
    project_manager.save()
    return True


@router.post(Route.SET_PROJECT_CONFIG_NAME)
async def route_set_project_config_name(
    x: SetProjectConfigNameRequest, state: AppStateFromRequest
):
    try:
        project_manager = state.project_manager_switcher.main
        await project_manager.set_project_config_name(x.projectConfigId, x.newName)
        project_manager.save()
    except ProjectNameTaken as e:
        raise HTTPException(status_code=422, detail=repr(e))


@router.post(Route.GET_DEFAULT_PROJECT_CONFIG_NAME)
def router_get_default_project_config_name(state: AppStateFromRequest) -> str | None:
    return state.project_manager_switcher.main.get_default_project_config_name()


@router.post(Route.SET_AS_DEFAULT_PROJECT)
async def router_set_as_default_project(
    x: SetAsDefaultProjectRequest, state: AppStateFromRequest
):
    project_manager = state.project_manager_switcher.main
    await project_manager.set_as_default_project(x.projectId)
    project_manager.save()


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
    x: GetNotificationsRequest, state: AppStateFromRequest
) -> list[SettaNotification]:
    with state.dbe.session as db:
        notifications = load_project_notifications(db, x.projectConfigId)
        return notifications


@router.post(Route.DELETE_NOTIFICATION)
def route_delete_notification(x: DeleteNotificationRequest, state: AppStateFromRequest):
    with state.dbe.session as db:
        success = delete_notification(db, x.notificationId)
        return {"success": success}
