from fastapi import BackgroundTasks
from pydantic import BaseModel

from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.routes import Route
from setta.types.settings_state import SettingsState

router = SettaAPIRouter()


class SaveSettingsRequest(BaseModel):
    settings: dict


class SaveSettingsProjectRequest(BaseModel):
    settingsProject: ProjectStateSingleConfig


@router.post(Route.SAVE_SETTINGS)
def route_save_settings(x: SaveSettingsRequest, state: AppStateFromRequest):
    return state.settings_file.save_settings(x.settings)


@router.post(Route.LOAD_SETTINGS)
def route_load_settings(state: AppStateFromRequest) -> SettingsState:
    return state.settings_file.load_settings()


@router.post(Route.SAVE_SETTINGS_PROJECT)
async def route_save_settings_project(
    x: SaveSettingsProjectRequest,
    background_tasks: BackgroundTasks,
    state: AppStateFromRequest,
) -> SettingsState | None:
    notification = None
    output = None
    try:
        output = state.settings_file.save_settings_project(x.settingsProject)
        notification = SettaNotification(
            projectConfigId=x.settingsProject.projectConfig.id,
            message="Saved!",
            temporary=True,
        )
    except Exception:
        notification = SettaNotification(
            projectConfigId=x.settingsProject.projectConfig.id,
            message="Failed to save",
            type=SettaNotificationType.error,
            temporary=True,
        )

    background_tasks.add_task(
        state.wmh_frontend_sender.broadcast_notification,
        notification,
    )

    return output


@router.post(Route.LOAD_SETTINGS_PROJECT)
async def route_load_settings_project(
    state: AppStateFromRequest,
) -> ProjectStateSingleConfig:
    p = state.settings_file.load_settings_project()
    return p
