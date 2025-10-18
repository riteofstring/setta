from pydantic import BaseModel

from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.generated.settings_state import SettingsState
from setta.types.routes import Route

router = SettaAPIRouter()


class SaveSettingsRequest(BaseModel):
    settings: SettingsState


@router.post(Route.SAVE_SETTINGS)
async def route_save_settings(x: SaveSettingsRequest, state: AppStateFromRequest):
    await state.settings_file.save_settings(x.settings)


@router.post(Route.LOAD_SETTINGS)
def route_load_settings(state: AppStateFromRequest) -> SettingsState:
    return state.settings_file.load_settings()
