from fastapi import Depends, HTTPException
from pydantic import BaseModel

from setta.logging.project_id_route import require_project_context
from setta.project_state.project_manager_types import SaveAsNewProjectConfigRequest
from setta.routers.dependencies import ReadyAppStateFromRequest as AppStateFromRequest
from setta.routers.dependencies import require_ide_mode
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.helpers_lvl2 import ProjectNameTaken, ProjectNotFound
from setta.types.id import ID
from setta.types.notifications import (
    SettaNotification,
    SettaNotificationType,
)
from setta.types.project_state import AllProjectMetadata, ProjectStateSingleConfig
from setta.types.routes import Route
from setta.utils.errors import InvalidProjectName

router = SettaProjectContextAPIRouter(dependencies=[Depends(require_ide_mode)])


class ProjectLoadRequest(BaseModel):
    projectConfigName: str


class CreateProjectConfigRequest(BaseModel):
    previewImgColor: str


class DeleteProjectConfigsRequest(BaseModel):
    ids: list[ID]


class SetProjectConfigNameRequest(BaseModel):
    projectConfigId: ID
    newName: str


class SetAsDefaultProjectRequest(BaseModel):
    projectConfigId: ID


class FilterDataForJSONExportRequest(BaseModel):
    project: dict


class AddDefaultDataForJSONImportRequest(BaseModel):
    project: dict


class GetNotificationsRequest(BaseModel):
    projectConfigId: ID


class DeleteNotificationRequest(BaseModel):
    notificationId: ID


class ManualSaveRequest(BaseModel):
    projectConfigId: ID


@router.post(Route.LOAD_ALL_PROJECT_METADATA)
def route_load_all_project_metadata(state: AppStateFromRequest) -> AllProjectMetadata:
    defaultProjectId, projectMetadata = (
        state.project_manager_switcher.main.get_all_project_metadata()
    )
    return AllProjectMetadata(
        defaultProjectConfigId=defaultProjectId, projectMetadata=projectMetadata
    )


@router.post(Route.LOAD_PROJECT_CONFIG)
async def route_load_project_config(
    x: ProjectLoadRequest, state: AppStateFromRequest
) -> ProjectStateSingleConfig:
    try:
        projectConfigId = state.project_manager_switcher.get_config_id_by_name(
            x.projectConfigName
        )
        project_manager = state.project_manager_switcher.get(projectConfigId)
        return await project_manager.load_project_config(projectConfigId)
    except ProjectNotFound as exc:
        raise HTTPException(status_code=404, detail=repr(exc)) from exc


@router.post(Route.SAVE_PROJECT)
@require_project_context()
async def route_save_project(
    x: ManualSaveRequest,
    state: AppStateFromRequest,
):
    try:
        project_manager = state.project_manager_switcher.get(x.projectConfigId)
        await project_manager.finish_pending_operations()
        project_manager.perform_manual_save()
        notification = SettaNotification(
            projectConfigId=x.projectConfigId,
            message="Saved!",
            type=SettaNotificationType.save,
        )
        await state.wmh_frontend_sender.broadcast_notification(notification)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to save project") from exc


@router.post(Route.SAVE_AS_NEW_PROJECT_CONFIG)
@require_project_context()
async def route_save_as_new_project_config(
    x: SaveAsNewProjectConfigRequest, state: AppStateFromRequest
):
    project_manager = state.project_manager_switcher.get(x.projectConfigId)
    await project_manager.finish_pending_operations()
    try:
        await project_manager.save_as_new_project_config(x)
    except (InvalidProjectName, ProjectNameTaken) as exc:
        raise HTTPException(status_code=422, detail=repr(exc)) from exc


@router.post(Route.CREATE_PROJECT_CONFIG)
async def route_create_project_config(
    x: CreateProjectConfigRequest, state: AppStateFromRequest
) -> str:
    project_manager = state.project_manager_switcher.main
    try:
        newProjectConfigName = await project_manager.create_project_config(
            x.previewImgColor
        )
    except InvalidProjectName as exc:
        raise HTTPException(status_code=422, detail=repr(exc)) from exc
    project_manager.perform_manual_save()
    return newProjectConfigName


@router.post(Route.DELETE_PROJECT_CONFIGS)
async def route_delete_project_configs(
    x: DeleteProjectConfigsRequest, state: AppStateFromRequest
):
    project_manager = state.project_manager_switcher.main
    await project_manager.delete_project_configs(x.ids)
    project_manager.perform_manual_save()
    return True


@router.post(Route.SET_PROJECT_CONFIG_NAME)
@require_project_context()
async def route_set_project_config_name(
    x: SetProjectConfigNameRequest, state: AppStateFromRequest
):
    try:
        project_manager = state.project_manager_switcher.main
        await project_manager.set_project_config_name(x.projectConfigId, x.newName)
        project_manager.perform_manual_save()
    except (InvalidProjectName, ProjectNameTaken) as exc:
        raise HTTPException(status_code=422, detail=repr(exc)) from exc


@router.post(Route.GET_DEFAULT_PROJECT_CONFIG_NAME)
def router_get_default_project_config_name(state: AppStateFromRequest) -> str | None:
    return state.project_manager_switcher.main.get_default_project_config_name()


@router.post(Route.SET_AS_DEFAULT_PROJECT)
@require_project_context(body_key="projectConfigId")
async def router_set_as_default_project(
    x: SetAsDefaultProjectRequest, state: AppStateFromRequest
):
    project_manager = state.project_manager_switcher.main
    await project_manager.set_as_default_project(x.projectConfigId)
    project_manager.perform_manual_save()


@router.post(Route.GET_NOTIFICATIONS)
@require_project_context()
def route_get_notifications(
    x: GetNotificationsRequest, state: AppStateFromRequest
) -> list[SettaNotification]:
    return state.dbe.read_notifications(x.projectConfigId)


@router.post(Route.DELETE_NOTIFICATION)
def route_delete_notification(x: DeleteNotificationRequest, state: AppStateFromRequest):
    success = state.dbe.delete_notification(x.notificationId)
    return {"success": success}
