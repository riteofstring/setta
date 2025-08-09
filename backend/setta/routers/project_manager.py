from setta.project_state.lsp_response_handlers.completion import CodeMirrorCompletion
from setta.project_state.project_manager_types import (
    ChangeParamImplRequest,
    ClearTextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    CreateNewSectionVersionRequest,
    CreateTopLevelSectionRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteSectionsRequest,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    RedoRequest,
    SetCallableRequest,
    TextFieldCompletionRequest,
    UndoRequest,
    UpdateFromFrontendRequest,
    UpdateFromFrontendReturn,
    UpdateParamImplConfigRequest,
)
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.notifications import SettaNotification
from setta.types.routes import Route
from setta.types.section_impls import SectionType

router = SettaAPIRouter()


@router.post(Route.CLEAR_TEXT_FIELD_COMPLETION)
async def route_clear_text_field_completion(
    x: ClearTextFieldCompletionRequest, state: AppStateFromRequest
) -> None:
    await state.project_manager.clear_text_field_completion(x)


@router.post(Route.SET_CALLABLE)
async def route_set_callable(x: SetCallableRequest, state: AppStateFromRequest) -> None:
    await state.project_manager.set_callable(x)


@router.post(Route.TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: TextFieldCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager.text_field_completion(x)


@router.post(Route.CODE_AREA_COMPLETION)
async def route_code_area_completion(
    x: CodeAreaCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager.code_area_completion(x)


@router.post(Route.GEN_CODE_PREFIX_COMPLETION)
async def route_gen_code_prefix_completion(
    x: GenCodePrefixCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager.gen_code_prefix_completion(x)


@router.post(Route.GEN_CODE_SUFFIX_COMPLETION)
async def route_gen_code_suffix_completion(
    x: GenCodeSuffixCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager.gen_code_suffix_completion(x)


@router.post(Route.CHANGE_PARAM_IMPL)
async def route_change_param_impl(
    x: ChangeParamImplRequest, state: AppStateFromRequest
):
    return await state.project_manager.change_param_impl(x)


@router.post(Route.UPDATE_PARAM_IMPL_CONFIG)
async def route_update_param_impl_config(
    x: UpdateParamImplConfigRequest, state: AppStateFromRequest
):
    return await state.project_manager.update_param_impl_config(x)


@router.post(Route.CREATE_TOP_LEVEL_SECTION)
async def route_create_top_level_section(
    x: CreateTopLevelSectionRequest, state: AppStateFromRequest
):
    sectionId = await state.project_manager.create_top_level_section(x)
    if x.implType == SectionType.Terminal:
        state.terminals.new_terminal(x.projectConfigId, sectionId)


@router.post(Route.CREATE_CHILD_SECTIONS)
async def route_create_child_sections(
    x: CreateChildSectionsRequest, state: AppStateFromRequest
):
    return await state.project_manager.create_child_sections(x)


@router.post(Route.CREATE_CHILD_SECTIONS_VIA_INCREMENTER)
async def route_create_child_sections_via_incrementer(
    x: CreateChildSectionsViaIncrementerRequest, state: AppStateFromRequest
):
    return await state.project_manager.create_child_sections_via_incrementer(x)


@router.post(Route.DELETE_SECTIONS)
async def route_delete_sections(x: DeleteSectionsRequest, state: AppStateFromRequest):
    return await state.project_manager.delete_sections(x)


@router.post(Route.DELETE_CHILD_SECTIONS_VIA_DECREMENTER)
async def route_delete_child_sections_via_decrementer(
    x: DeleteChildSectionsViaDecrementerRequest, state: AppStateFromRequest
):
    return await state.project_manager.delete_child_sections_via_decrementer(x)


@router.post(Route.CREATE_NEW_SECTION_VERSION)
async def route_create_new_section_version(
    x: CreateNewSectionVersionRequest, state: AppStateFromRequest
):
    await state.project_manager.create_new_section_version(x)
    notification = SettaNotification(
        message="New Version Created",
        temporary=True,
    )
    await state.wmh_frontend_sender.broadcast_notification(notification)


@router.post(Route.UNDO)
async def route_undo(x: UndoRequest, state: AppStateFromRequest) -> None:
    await state.project_manager.undo(x)


@router.post(Route.REDO)
async def route_redo(x: RedoRequest, state: AppStateFromRequest) -> None:
    await state.project_manager.redo(x)


@router.post(Route.UPDATE_FROM_FRONTEND)
async def route_update_from_frontend(
    x: UpdateFromFrontendRequest, state: AppStateFromRequest
) -> UpdateFromFrontendReturn:
    return await state.project_manager.update_from_frontend(x)
