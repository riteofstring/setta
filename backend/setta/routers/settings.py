from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from setta.database.settings_file import SettingsFile
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_state import ProjectSaveState
from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler

from .dependencies import (
    get_settings_file,
    get_wmh_base,
)

router = APIRouter()


class SaveSettingsRequest(BaseModel):
    settings: dict


class SaveSettingsProjectRequest(BaseModel):
    settingsProject: ProjectSaveState


@router.post(C.ROUTE_SAVE_SETTINGS)
def route_save_settings(
    x: SaveSettingsRequest, settings_file: SettingsFile = Depends(get_settings_file)
):
    return settings_file.save_settings(x.settings)


@router.post(C.ROUTE_LOAD_SETTINGS)
def route_load_settings(settings_file: SettingsFile = Depends(get_settings_file)):
    return settings_file.load_settings()


@router.post(C.ROUTE_SAVE_SETTINGS_PROJECT)
async def route_save_settings_project(
    x: SaveSettingsProjectRequest,
    background_tasks: BackgroundTasks,
    settings_file: SettingsFile = Depends(get_settings_file),
    websocket_msg_handler: BaseWebsocketMsgHandler = Depends(get_wmh_base),
):
    notification = None
    output = None
    try:
        output = settings_file.save_settings_project(x.settingsProject)
        notification = SettaNotification(
            projectConfigId=x.settingsProject.projectConfigId,
            message="Saved!",
            temporary=True,
        )
    except Exception:
        notification = SettaNotification(
            projectConfigId=x.settingsProject.projectConfigId,
            message="Failed to save",
            type=SettaNotificationType.error,
            temporary=True,
        )

    background_tasks.add_task(
        websocket_msg_handler.broadcast_notification,
        notification,
    )

    return output


@router.post(C.ROUTE_LOAD_SETTINGS_PROJECT)
async def route_load_settings_project(
    settings_file: SettingsFile = Depends(get_settings_file),
):
    p = settings_file.load_settings_project()
    return p
