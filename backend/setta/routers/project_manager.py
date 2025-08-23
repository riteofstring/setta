from setta.project_state.lsp_response_handlers.completion import CodeMirrorCompletion
from setta.project_state.project_manager_types import (
    AddKwargRequest,
    ChangeParamImplRequest,
    ClearTextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteJSONSourceFileAndVariantRequest,
    DeleteKwargRequest,
    DeleteSectionsRequest,
    DeleteSectionVariantRequestOrAsk,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    GetLatestProjectStateRequest,
    ProjectStateSingleConfigWithModCount,
    RedoRequest,
    SetCallableRequest,
    SetCodeObjNameRequest,
    SetCodeRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetParamEnteredValueRequest,
    SetSectionParamFilterRequest,
    SetTextBlockTextRequest,
    TextFieldCompletionRequest,
    ToggleMinimizedRequest,
    TogglePositionLockRequest,
    ToggleVariantJSONSourceRequest,
    UndoRequest,
    UpdateFromFrontendRequest,
    UpdateFromFrontendTopLevelSectionLayout,
    UpdateParamImplConfigRequest,
)
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.routes import Route
from setta.types.section_impls import SectionType

router = SettaAPIRouter()


@router.post(Route.CLEAR_TEXT_FIELD_COMPLETION)
async def route_clear_text_field_completion(
    x: ClearTextFieldCompletionRequest, state: AppStateFromRequest
) -> None:
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).clear_text_field_completion(x)


@router.post(Route.SET_CALLABLE)
async def route_set_callable(x: SetCallableRequest, state: AppStateFromRequest) -> None:
    await state.project_manager_switcher.get(x.projectConfigId).set_callable(x)


@router.post(Route.TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: TextFieldCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).text_field_completion(x)


@router.post(Route.CODE_AREA_COMPLETION)
async def route_code_area_completion(
    x: CodeAreaCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).code_area_completion(x)


@router.post(Route.GEN_CODE_PREFIX_COMPLETION)
async def route_gen_code_prefix_completion(
    x: GenCodePrefixCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).gen_code_prefix_completion(x)


@router.post(Route.GEN_CODE_SUFFIX_COMPLETION)
async def route_gen_code_suffix_completion(
    x: GenCodeSuffixCompletionRequest, state: AppStateFromRequest
) -> list[CodeMirrorCompletion]:
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).gen_code_suffix_completion(x)


@router.post(Route.CHANGE_PARAM_IMPL)
async def route_change_param_impl(
    x: ChangeParamImplRequest, state: AppStateFromRequest
):
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).change_param_impl(x)


@router.post(Route.UPDATE_PARAM_IMPL_CONFIG)
async def route_update_param_impl_config(
    x: UpdateParamImplConfigRequest, state: AppStateFromRequest
):
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).update_param_impl_config(x)


@router.post(Route.CREATE_TOP_LEVEL_SECTION)
async def route_create_top_level_section(
    x: CreateTopLevelSectionRequest, state: AppStateFromRequest
):
    sectionId = await state.project_manager_switcher.get(
        x.projectConfigId
    ).create_top_level_section(x)
    if x.implType == SectionType.Terminal:
        state.terminals.new_terminal(x.projectConfigId, sectionId)


@router.post(Route.CREATE_CHILD_SECTIONS)
async def route_create_child_sections(
    x: CreateChildSectionsRequest, state: AppStateFromRequest
):
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).create_child_sections(x)


@router.post(Route.CREATE_CHILD_SECTIONS_VIA_INCREMENTER)
async def route_create_child_sections_via_incrementer(
    x: CreateChildSectionsViaIncrementerRequest, state: AppStateFromRequest
):
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).create_child_sections_via_incrementer(x)


@router.post(Route.DELETE_SECTIONS)
async def route_delete_sections(x: DeleteSectionsRequest, state: AppStateFromRequest):
    return await state.project_manager_switcher.get(x.projectConfigId).delete_sections(
        x
    )


@router.post(Route.DELETE_CHILD_SECTIONS_VIA_DECREMENTER)
async def route_delete_child_sections_via_decrementer(
    x: DeleteChildSectionsViaDecrementerRequest, state: AppStateFromRequest
):
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).delete_child_sections_via_decrementer(x)


@router.post(Route.CREATE_NEW_SECTION_VARIANT)
async def route_create_new_section_variant(
    x: CreateNewSectionVariantRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).create_new_section_variant(x)
    notification = SettaNotification(
        message="New Variant Created",
    )
    await state.wmh_frontend_sender.broadcast_notification(notification)


@router.post(Route.UNDO)
async def route_undo(x: UndoRequest, state: AppStateFromRequest) -> None:
    await state.project_manager_switcher.get(x.projectConfigId).undo(x)


@router.post(Route.REDO)
async def route_redo(x: RedoRequest, state: AppStateFromRequest) -> None:
    await state.project_manager_switcher.get(x.projectConfigId).redo(x)


@router.post(Route.UPDATE_FROM_FRONTEND)
async def route_update_from_frontend(
    x: UpdateFromFrontendRequest, state: AppStateFromRequest
):
    success = await state.project_manager_switcher.get(
        x.projectState
    ).update_from_frontend(x)
    if not success:
        notification = SettaNotification(
            message="Update conflict",
            type=SettaNotificationType.error,
        )
        await state.wmh_frontend_sender.broadcast_notification(notification)


@router.post(Route.GET_LATEST_PROJECT_STATE)
async def route_get_latest_project_state(
    x: GetLatestProjectStateRequest, state: AppStateFromRequest
) -> ProjectStateSingleConfigWithModCount:
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).get_latest_project_state(x)


@router.post(Route.UPDATE_FROM_FRONTEND_TOP_LEVEL_SECTION_LAYOUT)
async def route_update_from_frontend_top_level_section_layout(
    x: UpdateFromFrontendTopLevelSectionLayout, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).update_from_frontend_top_level_section_layout(x)


@router.post(Route.ADD_KWARG)
async def route_add_kwarg(x: AddKwargRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).add_kwarg(x)


@router.post(Route.DELETE_KWARG)
async def route_delete_kwarg(x: DeleteKwargRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).delete_kwarg(x)


@router.post(Route.DELETE_SECTION_VARIANT_OR_ASK)
async def route_delete_section_variant_or_ask(
    x: DeleteSectionVariantRequestOrAsk, state: AppStateFromRequest
) -> str | None:
    filepath_to_delete = await state.project_manager_switcher.get(
        x.projectConfigId
    ).delete_section_variant_or_ask(x)
    if filepath_to_delete:
        return filepath_to_delete


@router.post(Route.TOGGLE_VARIANT_JSON_SOURCE)
async def route_toggle_variant_json_source(
    x: ToggleVariantJSONSourceRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).toggle_variant_json_source(x)


@router.post(Route.DELETE_JSON_SOURCE_FILE_AND_VARIANT)
async def route_delete_json_source_file_and_variant(
    x: DeleteJSONSourceFileAndVariantRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).delete_json_source_file_and_variant(x)


@router.post(Route.SET_TEXT_BLOCK_TEXT)
async def route_set_text_block_text(
    x: SetTextBlockTextRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_text_block_text(x)


@router.post(Route.SET_GEN_CODE_PREFIX)
async def route_set_gen_code_prefix(
    x: SetGenCodePrefixRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_gen_code_prefix(x)


@router.post(Route.SET_GEN_CODE_SUFFIX)
async def route_set_gen_code_suffix(
    x: SetGenCodeSuffixRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_gen_code_suffix(x)


@router.post(Route.SET_PARAM_ENTERED_VALUE)
async def route_set_param_entered_value(
    x: SetParamEnteredValueRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_param_entered_value(
        x
    )


@router.post(Route.SET_CODE_OBJ_NAME)
async def route_set_code_obj_name(x: SetCodeObjNameRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).set_code_obj_name(x)


@router.post(Route.TOGGLE_POSITION_LOCK)
async def route_toggle_position_lock(
    x: TogglePositionLockRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).toggle_position_lock(x)


@router.post(Route.TOGGLE_MINIMIZED)
async def route_toggle_minimized(x: ToggleMinimizedRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).toggle_minimized(x)


@router.post(Route.SET_CODE)
async def route_set_code(x: SetCodeRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).set_code(x)


@router.post(Route.SET_SECTION_PARAM_FILTER)
async def route_set_section_param_filter(
    x: SetSectionParamFilterRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_section_param_filter(x)
