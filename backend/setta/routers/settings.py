from fastapi import HTTPException, status
from pydantic import BaseModel

from setta.routers.dependencies import (
    AppStateFromRequest,
    ReadyAppStateFromRequest,
)
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.generated.settings_state import SettingsState
from setta.types.routes import Route

router = SettaAPIRouter()


class SaveSettingsRequest(BaseModel):
    settings: SettingsState


@router.post(Route.SAVE_SETTINGS)
async def route_save_settings(x: SaveSettingsRequest, state: ReadyAppStateFromRequest):
    if state.share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Share mode does not allow updating settings.",
        )
    previous_autosave = state.settings_file.settings.backend.autosave
    await state.settings_file.save_settings(x.settings)
    if previous_autosave and not state.settings_file.settings.backend.autosave:
        for manager in state.project_manager_switcher.project_managers:
            manager.autosave_debouncer.cancel_pending()


@router.post(Route.LOAD_SETTINGS)
def route_load_settings(state: AppStateFromRequest) -> SettingsState:
    return state.settings_file.load_settings()
