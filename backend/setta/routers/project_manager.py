from fastapi import Depends
from pydantic import BaseModel

from setta.project_state.lsp_response_handlers.completion import CodeMirrorCompletion
from setta.project_state.project_manager import ProjectManager
from setta.routers.dependencies import get_project_manager
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route

router = SettaAPIRouter()


class ClearTextFieldCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None


class SetSelectedItemRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    selectedItemName: str
    refetchParams: bool


class TextFieldCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    fullText: str
    position: int


@router.post(Route.CLEAR_TEXT_FIELD_COMPLETION)
async def route_clear_text_field_completion(
    x: ClearTextFieldCompletionRequest,
    project_manager: ProjectManager = Depends(get_project_manager),
) -> None:
    await project_manager.clear_text_field_completion(
        x.projectConfigId, x.sectionId, x.paramInfoId
    )


@router.post(Route.SET_SELECTED_ITEM)
async def route_set_selected_item(
    x: SetSelectedItemRequest,
    project_manager: ProjectManager = Depends(get_project_manager),
) -> None:
    await project_manager.set_selected_item(
        x.projectConfigId, x.sectionId, x.selectedItemName, x.refetchParams
    )


@router.post(Route.TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: TextFieldCompletionRequest,
    project_manager: ProjectManager = Depends(get_project_manager),
) -> list[CodeMirrorCompletion]:
    return await project_manager.text_field_autocomplete(
        x.projectConfigId, x.sectionId, x.paramInfoId, x.fullText, x.position
    )
