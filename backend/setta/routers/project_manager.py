from fastapi import HTTPException

from setta.project_state.lsp_response_handlers.completion import CodeMirrorCompletion
from setta.project_state.project_manager_types import (
    AcceptRenameRefactorRequest,
    AddKwargRequest,
    AppendDrawAreaLayerItemRequest,
    ChangeParamImplRequest,
    ClearTextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    DeclineRenameRefactorRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteJSONSourceFileAndVariantRequest,
    DeleteKwargRequest,
    DeleteSectionsRequest,
    DeleteSectionVariantOrAskRequest,
    ForceRefreshProjectRequest,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    GetLatestProjectStateRequest,
    GroupSectionsRequest,
    PasteSectionsRequest,
    PrepareSectionsForCopyRequest,
    ProjectStateSingleConfigWithCompletedOpIds,
    RedoRequest,
    SetActiveIdsRequest,
    SetBrowserAreaViewModeRequest,
    SetBrowserHideColumnRequest,
    SetCallableHideParamsRequest,
    SetCallableRequest,
    SetChartAreaDataPathRequest,
    SetChartSettingsRequest,
    SetChartTypeRequest,
    SetCodeFileBindingRequest,
    SetCodeObjNameRequest,
    SetCodeRequest,
    SetDefaultSectionVariantRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetImageAreaImagePathRequest,
    SetParamEnteredValueRequest,
    SetSectionHideUnpinnedParamsRequest,
    SetSectionNameRequest,
    SetSectionParamFilterRequest,
    SetSectionSizesRequest,
    SetSectionVariantNameRequest,
    SetSectionVariantRequest,
    SetSectionWithParamsDisplayModeRequest,
    SetSocialUrlRequest,
    SetTextBlockDisplayModeRequest,
    SetTextBlockFormatRequest,
    SetTextBlockTextRequest,
    SetTopLevelSectionLayoutRequest,
    SetViewportRequest,
    TextFieldCompletionRequest,
    ToggleMinimizedRequest,
    ToggleParamSelectedRequest,
    TogglePositionLockRequest,
    ToggleVariantFrozenRequest,
    ToggleVariantJSONSourceRequest,
    UndoRequest,
    UngroupGroupsRequest,
    UnselectAllParamsRequest,
    UpdateParamImplConfigRequest,
)
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.clipboard import SectionsClipboardData
from setta.types.notifications import SettaNotification
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
) -> str:
    sectionId = await state.project_manager_switcher.get(
        x.projectConfigId
    ).create_top_level_section(x)
    if x.implType == SectionType.Terminal:
        state.terminals.new_terminal(x.projectConfigId, sectionId)
    return sectionId


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


@router.post(Route.GET_LATEST_PROJECT_STATE)
async def route_get_latest_project_state(
    x: GetLatestProjectStateRequest, state: AppStateFromRequest
) -> ProjectStateSingleConfigWithCompletedOpIds:
    manager = state.project_manager_switcher.get(x.projectConfigId)
    projectState = await manager.get_latest_project_state(x)
    return ProjectStateSingleConfigWithCompletedOpIds(
        projectState=projectState,
        completedOpIds=[],
        pendingOpIds=list(manager.pending_frontend_ops.keys()),
    )


@router.post(Route.FORCE_REFRESH_LISTENER)
async def route_force_refresh_listener(
    x: ForceRefreshProjectRequest, state: AppStateFromRequest
) -> None:
    manager = state.project_manager_switcher.get(x.projectConfigId)
    try:
        project_state = await manager.get_latest_project_state(
            GetLatestProjectStateRequest(
                projectConfigId=x.projectConfigId,
                frontendOpId=x.frontendOpId,
            )
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"project state unavailable for {x.projectConfigId}",
        ) from exc

    await state.wmh_python_script_sender.send_force_refresh(
        projectState=project_state,
    )


@router.post(Route.SET_TOP_LEVEL_SECTION_LAYOUT)
async def route_set_top_level_section_layout(
    x: SetTopLevelSectionLayoutRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_top_level_section_layout(x)


@router.post(Route.ADD_KWARG)
async def route_add_kwarg(x: AddKwargRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).add_kwarg(x)


@router.post(Route.DELETE_KWARG)
async def route_delete_kwarg(x: DeleteKwargRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).delete_kwarg(x)


@router.post(Route.DELETE_SECTION_VARIANT_OR_ASK)
async def route_delete_section_variant_or_ask(
    x: DeleteSectionVariantOrAskRequest, state: AppStateFromRequest
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


@router.post(Route.SET_CODE_FILE_BINDING)
async def route_set_code_file_binding(
    x: SetCodeFileBindingRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_code_file_binding(x)


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


@router.post(Route.SET_SECTION_VARIANT)
async def route_set_section_variant(
    x: SetSectionVariantRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_section_variant(x)


@router.post(Route.SET_DEFAULT_SECTION_VARIANT)
async def route_set_default_section_variant(
    x: SetDefaultSectionVariantRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_default_section_variant(x)


@router.post(Route.TOGGLE_VARIANT_FROZEN)
async def route_toggle_variant_frozen(
    x: ToggleVariantFrozenRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).toggle_variant_frozen(x)


@router.post(Route.SET_SECTION_VARIANT_NAME)
async def route_set_section_variant_name(
    x: SetSectionVariantNameRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_section_variant_name(x)


@router.post(Route.SET_SECTION_SIZES)
async def route_set_section_sizes(
    x: SetSectionSizesRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_section_sizes(x)


@router.post(Route.SET_ACTIVE_IDS)
async def route_set_active_ids(x: SetActiveIdsRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).set_active_ids(x)


@router.post(Route.SET_VIEWPORT)
async def route_set_viewport(x: SetViewportRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).set_viewport(x)


@router.post(Route.SET_SECTION_NAME)
async def route_set_section_name(x: SetSectionNameRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).set_section_name(x)


@router.post(Route.ACCEPT_RENAME_REFACTOR)
async def route_accept_rename_refactor(
    x: AcceptRenameRefactorRequest, state: AppStateFromRequest
) -> None:
    await state.project_manager_switcher.get(x.projectConfigId).accept_rename_refactor(
        x
    )


@router.post(Route.DECLINE_RENAME_REFACTOR)
async def route_decline_rename_refactor(
    x: DeclineRenameRefactorRequest, state: AppStateFromRequest
) -> None:
    await state.project_manager_switcher.get(x.projectConfigId).decline_rename_refactor(
        x
    )


@router.post(Route.SET_TEXT_BLOCK_DISPLAY_MODE)
async def route_set_text_block_display_mode(
    x: SetTextBlockDisplayModeRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_text_block_display_mode(x)


@router.post(Route.SET_SECTION_WITH_PARAMS_DISPLAY_MODE)
async def route_set_section_with_params_display_mode(
    x: SetSectionWithParamsDisplayModeRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_section_with_params_display_mode(x)


@router.post(Route.SET_CALLABLE_HIDE_PARAMS)
async def route_set_callable_hide_params(
    x: SetCallableHideParamsRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_callable_hide_params(x)


@router.post(Route.SET_SECTION_HIDE_UNPINNED_PARAMS)
async def route_set_section_hide_unpinned_params(
    x: SetSectionHideUnpinnedParamsRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_section_hide_unpinned_params(x)


@router.post(Route.SET_BROWSER_AREA_VIEW_MODE)
async def route_set_browser_area_view_mode(
    x: SetBrowserAreaViewModeRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_browser_area_view_mode(x)


@router.post(Route.SET_BROWSER_HIDE_COLUMN)
async def route_set_browser_hide_column(
    x: SetBrowserHideColumnRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_browser_hide_column(
        x
    )


@router.post(Route.SET_TEXT_BLOCK_FORMAT)
async def route_set_text_block_format(
    x: SetTextBlockFormatRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_text_block_format(x)


@router.post(Route.SET_SOCIAL_URL)
async def route_set_social_url(x: SetSocialUrlRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).set_social_url(x)


@router.post(Route.GROUP_SECTIONS)
async def route_group_sections(x: GroupSectionsRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).group_sections(x)


@router.post(Route.UNGROUP_GROUPS)
async def route_ungroup_groups(x: UngroupGroupsRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).ungroup_groups(x)


@router.post(Route.TOGGLE_PARAM_SELECTED)
async def route_toggle_param_selected(
    x: ToggleParamSelectedRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).toggle_param_selected(x)


@router.post(Route.UNSELECT_ALL_PARAMS)
async def route_unselect_all_params(
    x: UnselectAllParamsRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).unselect_all_params(x)


@router.post(Route.PREPARE_SECTIONS_FOR_COPY)
async def route_prepare_sections_for_copy(
    x: PrepareSectionsForCopyRequest, state: AppStateFromRequest
) -> SectionsClipboardData:
    return await state.project_manager_switcher.get(
        x.projectConfigId
    ).prepare_sections_for_copy(x)


@router.post(Route.PASTE_SECTIONS)
async def route_paste_sections(x: PasteSectionsRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).paste_sections(x)


@router.post(Route.APPEND_DRAW_AREA_LAYER_ITEM)
async def route_append_draw_area_layer_item(
    x: AppendDrawAreaLayerItemRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).append_draw_area_layer_item(x)


@router.post(Route.SET_IMAGE_AREA_IMAGE_PATH)
async def route_set_image_area_image_path(
    x: SetImageAreaImagePathRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_image_area_image_path(x)


@router.post(Route.SET_CHART_AREA_IMAGE_PATH)
async def route_set_chart_area_data_path(
    x: SetChartAreaDataPathRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_chart_area_data_path(x)


@router.post(Route.SET_CHART_TYPE)
async def route_set_chart_type(x: SetChartTypeRequest, state: AppStateFromRequest):
    await state.project_manager_switcher.get(x.projectConfigId).set_chart_type(x)


@router.post(Route.SET_CHART_SETTINGS)
async def route_set_chart_settings(
    x: SetChartSettingsRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_chart_settings(x)
