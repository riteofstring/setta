from pydantic import BaseModel

from setta.routers.dependencies import (
    RuntimeContextFromRequest,
    require_full_ide_runtime,
)
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.generated.settings_state import SettingsState
from setta.types.routes import Route

router = SettaAPIRouter()


class SaveSettingsRequest(BaseModel):
    settings: SettingsState


@router.post(Route.SAVE_SETTINGS)
async def route_save_settings(x: SaveSettingsRequest, ctx: RuntimeContextFromRequest):
    ctx.require_ide_mode("Share mode does not allow updating settings.")
    require_full_ide_runtime(ctx.state)
    previous_autosave = ctx.state.settings_file.settings.backend.autosave
    await ctx.state.settings_file.save_settings(x.settings)
    if previous_autosave and not ctx.state.settings_file.settings.backend.autosave:
        for manager in ctx.state.project_manager_switcher.project_managers:
            manager.autosave_debouncer.cancel_pending()


@router.post(Route.LOAD_SETTINGS)
def route_load_settings(ctx: RuntimeContextFromRequest) -> SettingsState:
    require_full_ide_runtime(ctx.state)
    return ctx.state.settings_file.load_settings()
