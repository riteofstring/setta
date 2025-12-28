from pathlib import Path

from fastapi import HTTPException
from pydantic import BaseModel

from setta.logging.project_id_route import require_project_context
from setta.lsp.managers import restart_lsps
from setta.lsp.python_environments import list_python_environments
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.id import ID
from setta.types.language_server import PythonEnvironmentInfo
from setta.types.routes import Route
from setta.types.settings_state import LanguageServerSettings
from setta.utils.constants import CWD

from .dependencies import ReadyAppStateFromRequest as AppStateFromRequest

router = SettaProjectContextAPIRouter()


class TypeCheckRequest(BaseModel):
    projectConfigId: ID


class ListPythonEnvironmentsRequest(BaseModel):
    projectRoot: str | None = None


class ListPythonEnvironmentsResponse(BaseModel, extra="forbid"):
    environments: list[PythonEnvironmentInfo]
    selectedPath: str | None


class SetLanguageServerInterpreterRequest(BaseModel):
    pythonPath: str | None


@router.post(Route.RESTART_LANGUAGE_SERVER)
async def route_restart_language_server(state: AppStateFromRequest):
    await restart_lsps(state.lsps, state.lsp_readers, state.lsp_writers)


@router.post(Route.TYPE_CHECK)
@require_project_context()
async def route_type_check(x: TypeCheckRequest, state: AppStateFromRequest):
    return await state.project_manager_switcher.get(x.projectConfigId).type_check(
        x.projectConfigId
    )


@router.post(Route.GET_PYTHON_ENVIRONMENTS)
async def route_get_python_environments(
    x: ListPythonEnvironmentsRequest, state: AppStateFromRequest
) -> ListPythonEnvironmentsResponse:
    project_root = CWD
    if x.projectRoot:
        project_root = Path(x.projectRoot)
        if not project_root.exists():
            raise HTTPException(
                status_code=400,
                detail="projectRoot does not exist",
            )

    environments = list_python_environments(project_root=project_root)
    selected_path = state.settings_file.settings.languageServer.basedpyright.pythonPath
    return ListPythonEnvironmentsResponse(
        environments=environments,
        selectedPath=selected_path,
    )


@router.post(Route.SET_LANGUAGE_SERVER_INTERPRETER)
async def route_set_language_server_interpreter(
    x: SetLanguageServerInterpreterRequest, state: AppStateFromRequest
) -> LanguageServerSettings:
    if x.pythonPath is not None:
        python_path = Path(x.pythonPath)
        if not python_path.exists():
            raise HTTPException(
                status_code=400,
                detail="pythonPath does not exist",
            )
        if not python_path.is_file():
            raise HTTPException(
                status_code=400,
                detail="pythonPath is not a file",
            )

    settings = state.settings_file.settings
    settings.languageServer.basedpyright.pythonPath = x.pythonPath
    await state.settings_file.save_settings(settings)

    language_server_settings = state.settings_file.settings.languageServer
    state.lsps.update_settings(language_server_settings)
    await restart_lsps(state.lsps, state.lsp_readers, state.lsp_writers)
    return language_server_settings
