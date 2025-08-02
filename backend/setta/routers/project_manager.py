from pydantic import BaseModel

from setta.project_state.lsp_response_handlers.completion import CodeMirrorCompletion
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.types.section_impls import SectionType
from setta.types.simplified_states import Position

router = SettaAPIRouter()


class ClearTextFieldCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None


class SetCallableRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    callableName: str
    refetchParams: bool


class TextFieldCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str | None
    fullText: str
    position: int


class CodeAreaCompletionRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    fullText: str
    position: int


class GenCodePrefixCompletionRequest(BaseModel):
    projectConfigId: str
    fullText: str
    position: int


class GenCodeSuffixCompletionRequest(BaseModel):
    projectConfigId: str
    fullText: str
    position: int


class ChangeParamImplRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    selectedId: str


class UpdateParamImplConfigRequest(BaseModel):
    projectConfigId: str
    sectionId: str
    paramInfoId: str
    newConfig: dict


class CreateSectionRequest(BaseModel):
    projectConfigId: str
    implType: SectionType
    position: Position


@router.post(Route.CLEAR_TEXT_FIELD_COMPLETION)
async def route_clear_text_field_completion(
    x: ClearTextFieldCompletionRequest, state: AppStateFromRequest
) -> None:
    await state.project_manager.clear_text_field_completion(
        x.projectConfigId, x.sectionId, x.paramInfoId
    )


@router.post(Route.SET_CALLABLE)
async def route_set_callable(x: SetCallableRequest, state: AppStateFromRequest) -> None:
    await state.project_manager.set_callable(
        x.projectConfigId, x.sectionId, x.callableName, x.refetchParams
    )


@router.post(Route.TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: TextFieldCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager.text_field_autocomplete(
        x.projectConfigId, x.sectionId, x.paramInfoId, x.fullText, x.position
    )


@router.post(Route.CODE_AREA_COMPLETION)
async def route_code_area_completion(
    x: CodeAreaCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager.code_area_autocomplete(
        x.projectConfigId, x.sectionId, x.fullText, x.position
    )


@router.post(Route.GEN_CODE_PREFIX_COMPLETION)
async def route_gen_code_prefix_completion(
    x: GenCodePrefixCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager.gen_code_prefix_autocomplete(
        x.projectConfigId, x.fullText, x.position
    )


@router.post(Route.GEN_CODE_SUFFIX_COMPLETION)
async def route_gen_code_suffix_completion(
    x: GenCodeSuffixCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager.gen_code_suffix_autocomplete(
        x.projectConfigId, x.fullText, x.position
    )


@router.post(Route.CHANGE_PARAM_IMPL)
async def route_change_param_impl(
    x: ChangeParamImplRequest, state: AppStateFromRequest
):
    return await state.project_manager.change_param_impl(
        x.projectConfigId, x.sectionId, x.paramInfoId, x.selectedId
    )


@router.post(Route.UPDATE_PARAM_IMPL_CONFIG)
async def route_update_param_impl_config(
    x: UpdateParamImplConfigRequest, state: AppStateFromRequest
):
    return await state.project_manager.update_param_impl_config(
        x.projectConfigId, x.sectionId, x.paramInfoId, x.newConfig
    )


@router.post(Route.CREATE_TOP_LEVEL_SECTION)
async def route_create_top_level_section(
    x: CreateSectionRequest, state: AppStateFromRequest
):
    return await state.project_manager.create_top_level_section(
        x.projectConfigId, x.implType, x.position
    )
