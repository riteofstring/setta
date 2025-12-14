from fastapi import BackgroundTasks, HTTPException, Request
from pydantic import BaseModel

from setta.logging.context import get_logging_context
from setta.logging.context_bindings import wrap_background_callable
from setta.logging.errors import log_route_failure
from setta.project_state.project_manager_types import SaveAsNewProjectConfigRequest
from setta.routers.dependencies import ReadyAppStateFromRequest as AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.helpers_lvl2 import (
    ProjectNameTaken,
    ProjectNotFound,
)
from setta.types.id import ID
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_state import AllProjectMetadata, ProjectStateSingleConfig
from setta.types.routes import Route

router = SettaAPIRouter()


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
    projectId: ID


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
    x: ProjectLoadRequest, state: AppStateFromRequest, request: Request
) -> ProjectStateSingleConfig:
    label = "projects.load-config"
    context: dict[str, str] = {"project_config_name": x.projectConfigName}
    try:
        projectConfigId = state.project_manager_switcher.get_config_id_by_name(
            x.projectConfigName
        )
        context["project_config_id"] = projectConfigId
        project_manager = state.project_manager_switcher.get(projectConfigId)
        return await project_manager.load_project_config(projectConfigId)
    except ProjectNotFound as exc:
        log_route_failure(
            exc,
            label=label,
            handled=True,
            context=context,
            request=request,
        )
        raise HTTPException(status_code=404, detail=repr(exc)) from exc
    except Exception as exc:
        log_route_failure(
            exc,
            label=label,
            context=context,
            request=request,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post(Route.SAVE_PROJECT)
async def route_save_project(
    x: ManualSaveRequest,
    background_tasks: BackgroundTasks,
    state: AppStateFromRequest,
    request: Request,
):
    context = {"project_config_id": x.projectConfigId}
    try:
        project_manager = state.project_manager_switcher.get(x.projectConfigId)
        await project_manager.finish_pending_operations()
        project_manager.perform_manual_save()
        notification = SettaNotification(
            projectConfigId=x.projectConfigId,
            message="Saved!",
        )

    except Exception as exc:  # noqa: PERF203 - structured logging
        log_route_failure(
            exc,
            label="projects.manual-save",
            handled=True,
            notify_frontend=True,
            context=context,
            request=request,
        )
        notification = SettaNotification(
            projectConfigId=x.projectConfigId,
            message="Failed to save",
            type=SettaNotificationType.error,
        )

    background_tasks.add_task(
        wrap_background_callable(
            state.wmh_frontend_sender.broadcast_notification,
            label="manual-save-notification",
            project_id=x.projectConfigId,
            request_id=_current_request_id(),
        ),
        notification,
    )


@router.post(Route.SAVE_AS_NEW_PROJECT_CONFIG)
async def route_save_as_new_project_config(
    x: SaveAsNewProjectConfigRequest, state: AppStateFromRequest
):
    project_manager = state.project_manager_switcher.get(x.projectConfigId)
    await project_manager.finish_pending_operations()
    await project_manager.save_as_new_project_config(x)


@router.post(Route.CREATE_PROJECT_CONFIG)
async def route_create_project_config(
    x: CreateProjectConfigRequest, state: AppStateFromRequest
) -> str:
    project_manager = state.project_manager_switcher.main
    newProjectConfigName = await project_manager.create_project_config(
        x.previewImgColor
    )
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
async def route_set_project_config_name(
    x: SetProjectConfigNameRequest, state: AppStateFromRequest, request: Request
):
    try:
        project_manager = state.project_manager_switcher.main
        await project_manager.set_project_config_name(x.projectConfigId, x.newName)
        project_manager.perform_manual_save()
    except ProjectNameTaken as exc:
        log_route_failure(
            exc,
            label="projects.set-config-name",
            handled=True,
            context={
                "project_config_id": x.projectConfigId,
                "project_config_name": x.newName,
            },
            request=request,
        )
        raise HTTPException(status_code=422, detail=repr(exc)) from exc


@router.post(Route.GET_DEFAULT_PROJECT_CONFIG_NAME)
def router_get_default_project_config_name(state: AppStateFromRequest) -> str | None:
    return state.project_manager_switcher.main.get_default_project_config_name()


@router.post(Route.SET_AS_DEFAULT_PROJECT)
async def router_set_as_default_project(
    x: SetAsDefaultProjectRequest, state: AppStateFromRequest
):
    project_manager = state.project_manager_switcher.main
    await project_manager.set_as_default_project(x.projectId)
    project_manager.perform_manual_save()


@router.post(Route.GET_NOTIFICATIONS)
def route_get_notifications(
    x: GetNotificationsRequest, state: AppStateFromRequest
) -> list[SettaNotification]:
    return state.dbe.read_notifications(x.projectConfigId)


@router.post(Route.DELETE_NOTIFICATION)
def route_delete_notification(x: DeleteNotificationRequest, state: AppStateFromRequest):
    success = state.dbe.delete_notification(x.notificationId)
    return {"success": success}


def _current_request_id() -> str | None:
    return get_logging_context().get("request_id")
