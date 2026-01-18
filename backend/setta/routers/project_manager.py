from fastapi import HTTPException

from setta.project_state.lsp_response_handlers.completion import CodeMirrorCompletion
from setta.project_state.project_manager_types import (
    AcceptRenameRefactorRequest,
    AddKwargRequest,
    AppendDrawAreaLayerItemRequest,
    AutoLayoutTopLevelSectionsRequest,
    ChangeParamImplRequest,
    ClearTextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    CreateEdgeRequest,
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    CreateTopLevelSectionResponse,
    CreateViewModeRequest,
    DeclineRenameRefactorRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteEdgesRequest,
    DeleteJSONSourceFileAndVariantRequest,
    DeleteKwargRequest,
    DeleteSectionsRequest,
    DeleteSectionVariantOrAskRequest,
    DeleteViewModeRequest,
    ForceRefreshProjectRequest,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    GetLatestProjectStateRequest,
    GroupSectionsRequest,
    MoveSectionRequest,
    OutputAccessorCompletionRequest,
    PasteSectionsRequest,
    PrepareSectionsForCopyRequest,
    ProjectStateSingleConfigWithCompletedOpIds,
    ReconnectEdgeRequest,
    RedoRequest,
    SetActiveIdsRequest,
    SetActiveViewModeRequest,
    SetBrowserAreaViewModeRequest,
    SetBrowserColumnWidthsRequest,
    SetBrowserHideColumnRequest,
    SetCallableHideParamsRequest,
    SetCallableRequest,
    SetCallableResponse,
    SetChartAreaDataPathRequest,
    SetChartSettingsRequest,
    SetChartTypeRequest,
    SetCodeFileBindingRequest,
    SetCodeObjDisplayNameRequest,
    SetCodeObjNameRequest,
    SetCodeRequest,
    SetDefaultSectionVariantRequest,
    SetEdgesRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetGroupOverflowModeRequest,
    SetImageAreaImagePathRequest,
    SetMetaControlShowSectionTitleRequest,
    SetParamEnteredValueRequest,
    SetSectionColumnWidthRequest,
    SetSectionEdgeInputsRequest,
    SetSectionEdgeOutputsRequest,
    SetSectionHideUnpinnedParamsRequest,
    SetSectionNameRequest,
    SetSectionParamFilterRequest,
    SetSectionPinnedAreaHeightRequest,
    SetSectionPinnedParamsRequest,
    SetSectionSizesRequest,
    SetSectionVariantNameRequest,
    SetSectionVariantRequest,
    SetSectionWithParamsDisplayModeRequest,
    SetShowParamDisplayNamesRequest,
    SetSocialUrlRequest,
    SetTextBlockDisplayModeRequest,
    SetTextBlockFormatRequest,
    SetTextBlockHeadingAsSectionNameRequest,
    SetTextBlockMetaControlStyleRequest,
    SetTextBlockTextRequest,
    SetTopLevelSectionLayoutRequest,
    SetTypeErrorIgnoreRequest,
    SetViewModeNameRequest,
    SetViewportRequest,
    TextFieldCompletionRequest,
    ToggleGroupOrientationRequest,
    ToggleIsEditingViewModeRequest,
    ToggleMinimizedRequest,
    ToggleParamSelectedRequest,
    TogglePositionLocksRequest,
    ToggleSectionVisibilityRequest,
    ToggleVariantFrozenRequest,
    ToggleVariantJSONSourceRequest,
    ToggleViewModeUserFacingRequest,
    UndoRequest,
    UngroupGroupsRequest,
    UnselectAllParamsRequest,
    UpdateEdgeRequest,
    UpdateParamImplConfigRequest,
)
from setta.routers.dependencies import (
    ReadyAppStateFromRequest as AppStateFromRequest,
)
from setta.routers.dependencies import (
    RuntimeContextFromRequest,
)
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.share.policy import (
    SharePolicyGuard,
    deny_in_share_mode,
    enforce_share_policy_guard,
    ensure_share_param_value_allowed,
)
from setta.terminals.terminals import build_terminal_id
from setta.types.clipboard import SectionsClipboardData
from setta.types.routes import Route
from setta.types.section_impls import SectionType

router = SettaProjectContextAPIRouter(
    require_project_context_by_default=True,
)


async def _deny_share_mode_lsp(ctx) -> None:
    await deny_in_share_mode(
        share_mode=ctx.share_mode,
        frontend_sender=ctx.frontend_sender,
        message="Share mode disallows language server features.",
        share_session_id=ctx.share_session_id,
    )


async def _deny_share_mode_structural(ctx) -> None:
    await deny_in_share_mode(
        share_mode=ctx.share_mode,
        frontend_sender=ctx.frontend_sender,
        message="Share mode disallows structural changes.",
        share_session_id=ctx.share_session_id,
    )


async def _deny_share_mode_code_edit(ctx) -> None:
    await deny_in_share_mode(
        share_mode=ctx.share_mode,
        frontend_sender=ctx.frontend_sender,
        message="Share mode disallows code edits.",
        share_session_id=ctx.share_session_id,
    )


async def _deny_share_mode_param_impl(ctx) -> None:
    await deny_in_share_mode(
        share_mode=ctx.share_mode,
        frontend_sender=ctx.frontend_sender,
        message="Share mode disallows parameter implementation changes.",
        share_session_id=ctx.share_session_id,
    )


async def _deny_share_mode_param_metadata(ctx) -> None:
    await deny_in_share_mode(
        share_mode=ctx.share_mode,
        frontend_sender=ctx.frontend_sender,
        message="Share mode disallows parameter metadata changes.",
        share_session_id=ctx.share_session_id,
    )


async def _deny_share_mode_view_modes(ctx) -> None:
    await deny_in_share_mode(
        share_mode=ctx.share_mode,
        frontend_sender=ctx.frontend_sender,
        message="Share mode disallows view mode changes.",
        share_session_id=ctx.share_session_id,
    )


@router.post(Route.CLEAR_TEXT_FIELD_COMPLETION)
async def route_clear_text_field_completion(
    x: ClearTextFieldCompletionRequest, ctx: RuntimeContextFromRequest
) -> None:
    await _deny_share_mode_lsp(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.clear_text_field_completion(x)


@router.post(Route.SET_CALLABLE)
async def route_set_callable(
    x: SetCallableRequest, ctx: RuntimeContextFromRequest
) -> SetCallableResponse:
    await _deny_share_mode_lsp(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.set_callable(x)


@router.post(Route.TEXT_FIELD_COMPLETION)
async def route_text_field_completion(
    x: TextFieldCompletionRequest, ctx: RuntimeContextFromRequest
) -> list[CodeMirrorCompletion]:
    await _deny_share_mode_lsp(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.text_field_completion(x)


@router.post(Route.OUTPUT_ACCESSOR_COMPLETION)
async def route_output_accessor_completion(
    x: OutputAccessorCompletionRequest, ctx: RuntimeContextFromRequest
) -> list[CodeMirrorCompletion]:
    await _deny_share_mode_lsp(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.output_accessor_completion(x)


@router.post(Route.CODE_AREA_COMPLETION)
async def route_code_area_completion(
    x: CodeAreaCompletionRequest, ctx: RuntimeContextFromRequest
) -> list[CodeMirrorCompletion]:
    await _deny_share_mode_lsp(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.code_area_completion(x)


@router.post(Route.GEN_CODE_PREFIX_COMPLETION)
async def route_gen_code_prefix_completion(
    x: GenCodePrefixCompletionRequest, ctx: RuntimeContextFromRequest
) -> list[CodeMirrorCompletion]:
    await _deny_share_mode_lsp(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.gen_code_prefix_completion(x)


@router.post(Route.GEN_CODE_SUFFIX_COMPLETION)
async def route_gen_code_suffix_completion(
    x: GenCodeSuffixCompletionRequest, ctx: RuntimeContextFromRequest
) -> list[CodeMirrorCompletion]:
    await _deny_share_mode_lsp(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.gen_code_suffix_completion(x)


@router.post(Route.CHANGE_PARAM_IMPL)
async def route_change_param_impl(
    x: ChangeParamImplRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_param_impl(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.change_param_impl(x)


@router.post(Route.UPDATE_PARAM_IMPL_CONFIG)
async def route_update_param_impl_config(
    x: UpdateParamImplConfigRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_param_impl(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.update_param_impl_config(x)


@router.post(Route.CREATE_TOP_LEVEL_SECTION)
async def route_create_top_level_section(
    x: CreateTopLevelSectionRequest, ctx: RuntimeContextFromRequest
) -> CreateTopLevelSectionResponse:
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    result = await manager.create_top_level_section(x)
    if x.implType == SectionType.Terminal:
        share_session_id = ctx.share_session_id
        terminal_id = build_terminal_id(result.sectionId, share_session_id)
        ctx.state.terminals.new_terminal(
            x.projectConfigId,
            terminal_id,
            share_session_id=share_session_id,
        )
    return result


@router.post(Route.CREATE_CHILD_SECTIONS)
async def route_create_child_sections(
    x: CreateChildSectionsRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.create_child_sections(x)


@router.post(Route.CREATE_CHILD_SECTIONS_VIA_INCREMENTER)
async def route_create_child_sections_via_incrementer(
    x: CreateChildSectionsViaIncrementerRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.create_child_sections_via_incrementer(x)


@router.post(Route.DELETE_SECTIONS)
async def route_delete_sections(
    x: DeleteSectionsRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.delete_sections(x)


@router.post(Route.DELETE_CHILD_SECTIONS_VIA_DECREMENTER)
async def route_delete_child_sections_via_decrementer(
    x: DeleteChildSectionsViaDecrementerRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.delete_child_sections_via_decrementer(x)


@router.post(Route.CREATE_NEW_SECTION_VARIANT)
async def route_create_new_section_variant(
    x: CreateNewSectionVariantRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.variant)
    await manager.create_new_section_variant(x)
    await ctx.state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
        "New Variant Created",
        project_config_id=x.projectConfigId,
        share_session_id=ctx.share_session_id,
    )


@router.post(Route.CREATE_VIEW_MODE)
async def route_create_view_mode(
    x: CreateViewModeRequest, ctx: RuntimeContextFromRequest
) -> str:
    await _deny_share_mode_view_modes(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    return await manager.create_view_mode(x)


@router.post(Route.SET_ACTIVE_VIEW_MODE)
async def route_set_active_view_mode(
    x: SetActiveViewModeRequest, ctx: RuntimeContextFromRequest
) -> None:
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.variant)
    await manager.set_active_view_mode(x)


@router.post(Route.TOGGLE_IS_EDITING_VIEW_MODE)
async def route_toggle_is_editing_view_mode(
    x: ToggleIsEditingViewModeRequest, ctx: RuntimeContextFromRequest
) -> None:
    await _deny_share_mode_view_modes(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.toggle_is_editing_view_mode(x)


@router.post(Route.TOGGLE_SECTION_VISIBILITY)
async def route_toggle_section_visibility(
    x: ToggleSectionVisibilityRequest, ctx: RuntimeContextFromRequest
) -> None:
    await _deny_share_mode_view_modes(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.toggle_section_visibility(x)


@router.post(Route.TOGGLE_VIEW_MODE_USER_FACING)
async def route_toggle_view_mode_user_facing(
    x: ToggleViewModeUserFacingRequest, ctx: RuntimeContextFromRequest
) -> None:
    await _deny_share_mode_view_modes(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.toggle_view_mode_user_facing(x)


@router.post(Route.SET_VIEW_MODE_NAME)
async def route_set_view_mode_name(
    x: SetViewModeNameRequest, ctx: RuntimeContextFromRequest
) -> None:
    await _deny_share_mode_view_modes(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_view_mode_name(x)


@router.post(Route.DELETE_VIEW_MODE)
async def route_delete_view_mode(
    x: DeleteViewModeRequest, ctx: RuntimeContextFromRequest
) -> None:
    await _deny_share_mode_view_modes(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.delete_view_mode(x)


@router.post(Route.UNDO)
async def route_undo(x: UndoRequest, ctx: RuntimeContextFromRequest) -> None:
    await ctx.get_project_manager(x.projectConfigId).undo(x)


@router.post(Route.REDO)
async def route_redo(x: RedoRequest, ctx: RuntimeContextFromRequest) -> None:
    await ctx.get_project_manager(x.projectConfigId).redo(x)


@router.post(Route.GET_LATEST_PROJECT_STATE)
async def route_get_latest_project_state(
    x: GetLatestProjectStateRequest, ctx: RuntimeContextFromRequest
) -> ProjectStateSingleConfigWithCompletedOpIds:
    manager = ctx.get_project_manager(x.projectConfigId)
    projectState = await manager.get_latest_project_state(x)
    return ProjectStateSingleConfigWithCompletedOpIds(
        projectState=projectState,
        completedOpIds=[],
        pendingOpIds=list(manager.pending_frontend_ops.keys()),
    )


@router.post(Route.FORCE_REFRESH_LISTENER)
async def route_force_refresh_listener(
    x: ForceRefreshProjectRequest, ctx: RuntimeContextFromRequest
) -> None:
    manager = ctx.get_project_manager(x.projectConfigId)
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

    await ctx.state.wmh_python_script_sender.send_force_refresh(
        projectState=project_state,
        share_session_id=ctx.share_session_id,
    )


@router.post(Route.SET_TOP_LEVEL_SECTION_LAYOUT)
async def route_set_top_level_section_layout(
    x: SetTopLevelSectionLayoutRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_top_level_section_layout(x)


@router.post(Route.AUTO_LAYOUT_TOP_LEVEL_SECTIONS)
async def route_auto_layout_top_level_sections(
    x: AutoLayoutTopLevelSectionsRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.auto_layout_top_level_sections(x)


@router.post(Route.ADD_KWARG)
async def route_add_kwarg(x: AddKwargRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_param_metadata(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.add_kwarg(x)


@router.post(Route.DELETE_KWARG)
async def route_delete_kwarg(x: DeleteKwargRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_param_metadata(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.delete_kwarg(x)


@router.post(Route.DELETE_SECTION_VARIANT_OR_ASK)
async def route_delete_section_variant_or_ask(
    x: DeleteSectionVariantOrAskRequest, ctx: RuntimeContextFromRequest
) -> str | None:
    ctx.require_ide_mode("Share mode does not allow deleting section variants.")
    manager = ctx.get_project_manager(x.projectConfigId)
    filepath_to_delete = await manager.delete_section_variant_or_ask(x)
    if filepath_to_delete:
        return filepath_to_delete


@router.post(Route.TOGGLE_VARIANT_JSON_SOURCE)
async def route_toggle_variant_json_source(
    x: ToggleVariantJSONSourceRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.variant)
    await manager.toggle_variant_json_source(x)


@router.post(Route.DELETE_JSON_SOURCE_FILE_AND_VARIANT)
async def route_delete_json_source_file_and_variant(
    x: DeleteJSONSourceFileAndVariantRequest, ctx: RuntimeContextFromRequest
):
    ctx.require_ide_mode("Share mode does not allow deleting section variants.")
    await ctx.get_project_manager(
        x.projectConfigId
    ).delete_json_source_file_and_variant(x)


@router.post(Route.SET_TEXT_BLOCK_TEXT)
async def route_set_text_block_text(
    x: SetTextBlockTextRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.param)
    await manager.set_text_block_text(x)


@router.post(Route.SET_GEN_CODE_PREFIX)
async def route_set_gen_code_prefix(
    x: SetGenCodePrefixRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_code_edit(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_gen_code_prefix(x)


@router.post(Route.SET_GEN_CODE_SUFFIX)
async def route_set_gen_code_suffix(
    x: SetGenCodeSuffixRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_code_edit(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_gen_code_suffix(x)


@router.post(Route.SET_SHOW_PARAM_DISPLAY_NAMES)
async def route_set_show_param_display_names(
    x: SetShowParamDisplayNamesRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_show_param_display_names(x)


@router.post(Route.SET_PARAM_ENTERED_VALUE)
async def route_set_param_entered_value(
    x: SetParamEnteredValueRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    if ctx.share_mode:
        project_state = manager.get_single_config_state(x.projectConfigId)
        await ensure_share_param_value_allowed(
            policy=ctx.policy,
            frontend_sender=ctx.frontend_sender,
            project_state=project_state,
            section_id=x.sectionId,
            param_info_id=x.paramInfoId,
            share_session_id=ctx.share_session_id,
        )
    await manager.set_param_entered_value(x)


@router.post(Route.SET_TYPE_ERROR_IGNORE)
async def route_set_type_error_ignore(
    x: SetTypeErrorIgnoreRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.param)
    await manager.set_type_error_ignore(x)


@router.post(Route.SET_CODE_OBJ_NAME)
async def route_set_code_obj_name(
    x: SetCodeObjNameRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_code_obj_name(x)


@router.post(Route.SET_CODE_OBJ_DISPLAY_NAME)
async def route_set_code_obj_display_name(
    x: SetCodeObjDisplayNameRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_code_obj_display_name(x)


@router.post(Route.SET_CODE_FILE_BINDING)
async def route_set_code_file_binding(
    x: SetCodeFileBindingRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_code_file_binding(x)


@router.post(Route.TOGGLE_POSITION_LOCKS)
async def route_toggle_position_locks(
    x: TogglePositionLocksRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.toggle_position_locks(x)


@router.post(Route.TOGGLE_MINIMIZED)
async def route_toggle_minimized(
    x: ToggleMinimizedRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.toggle_minimized(x)


@router.post(Route.TOGGLE_GROUP_ORIENTATION)
async def route_toggle_group_orientation(
    x: ToggleGroupOrientationRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.toggle_group_orientation(x)


@router.post(Route.SET_GROUP_OVERFLOW_MODE)
async def route_set_group_overflow_mode(
    x: SetGroupOverflowModeRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(x.projectConfigId).set_group_overflow_mode(
        x
    )


@router.post(Route.SET_CODE)
async def route_set_code(x: SetCodeRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_code_edit(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_code(x)


@router.post(Route.SET_SECTION_PARAM_FILTER)
async def route_set_section_param_filter(
    x: SetSectionParamFilterRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_section_param_filter(x)


@router.post(Route.SET_SECTION_EDGE_INPUTS)
async def route_set_section_edge_inputs(
    x: SetSectionEdgeInputsRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_param_metadata(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_section_edge_inputs(x)


@router.post(Route.SET_SECTION_EDGE_OUTPUTS)
async def route_set_section_edge_outputs(
    x: SetSectionEdgeOutputsRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_param_metadata(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_section_edge_outputs(x)


@router.post(Route.CREATE_EDGE)
async def route_create_edge(x: CreateEdgeRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.create_edge(x)


@router.post(Route.UPDATE_EDGE)
async def route_update_edge(x: UpdateEdgeRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.update_edge(x)


@router.post(Route.DELETE_EDGES)
async def route_delete_edges(x: DeleteEdgesRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.delete_edges(x)


@router.post(Route.RECONNECT_EDGE)
async def route_reconnect_edge(x: ReconnectEdgeRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.reconnect_edge(x)


@router.post(Route.SET_EDGES)
async def route_set_edges(x: SetEdgesRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_edges(x)


@router.post(Route.SET_SECTION_VARIANT)
async def route_set_section_variant(
    x: SetSectionVariantRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.variant)
    await manager.set_section_variant(x)


@router.post(Route.SET_DEFAULT_SECTION_VARIANT)
async def route_set_default_section_variant(
    x: SetDefaultSectionVariantRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.variant)
    await manager.set_default_section_variant(x)


@router.post(Route.TOGGLE_VARIANT_FROZEN)
async def route_toggle_variant_frozen(
    x: ToggleVariantFrozenRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.variant)
    await manager.toggle_variant_frozen(x)


@router.post(Route.SET_SECTION_VARIANT_NAME)
async def route_set_section_variant_name(
    x: SetSectionVariantNameRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.variant)
    await manager.set_section_variant_name(x)


@router.post(Route.SET_SECTION_SIZES)
async def route_set_section_sizes(
    x: SetSectionSizesRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_section_sizes(x)


@router.post(Route.SET_ACTIVE_IDS)
async def route_set_active_ids(x: SetActiveIdsRequest, ctx: RuntimeContextFromRequest):
    await ctx.get_project_manager(x.projectConfigId).set_active_ids(x)


@router.post(Route.SET_VIEWPORT)
async def route_set_viewport(x: SetViewportRequest, ctx: RuntimeContextFromRequest):
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_viewport(x)


@router.post(Route.SET_SECTION_NAME)
async def route_set_section_name(
    x: SetSectionNameRequest, ctx: RuntimeContextFromRequest
):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_section_name(x)


@router.post(Route.SET_META_CONTROL_SHOW_SECTION_TITLE)
async def route_set_meta_control_show_section_title(
    x: SetMetaControlShowSectionTitleRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_meta_control_show_section_title(x)


@router.post(Route.ACCEPT_RENAME_REFACTOR)
async def route_accept_rename_refactor(
    x: AcceptRenameRefactorRequest, ctx: RuntimeContextFromRequest
) -> None:
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.accept_rename_refactor(x)


@router.post(Route.DECLINE_RENAME_REFACTOR)
async def route_decline_rename_refactor(
    x: DeclineRenameRefactorRequest, ctx: RuntimeContextFromRequest
) -> None:
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.decline_rename_refactor(x)


@router.post(Route.SET_TEXT_BLOCK_DISPLAY_MODE)
async def route_set_text_block_display_mode(
    x: SetTextBlockDisplayModeRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_text_block_display_mode(x)


@router.post(Route.SET_TEXT_BLOCK_HEADING_AS_SECTION_NAME)
async def route_set_text_block_heading_as_section_name(
    x: SetTextBlockHeadingAsSectionNameRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_text_block_heading_as_section_name(x)


@router.post(Route.SET_TEXT_BLOCK_META_CONTROL_STYLE)
async def route_set_text_block_meta_control_style(
    x: SetTextBlockMetaControlStyleRequest, state: AppStateFromRequest
):
    await state.project_manager_switcher.get(
        x.projectConfigId
    ).set_text_block_meta_control_style(x)


@router.post(Route.SET_SECTION_WITH_PARAMS_DISPLAY_MODE)
async def route_set_section_with_params_display_mode(
    x: SetSectionWithParamsDisplayModeRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_section_with_params_display_mode(x)


@router.post(Route.SET_CALLABLE_HIDE_PARAMS)
async def route_set_callable_hide_params(
    x: SetCallableHideParamsRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_callable_hide_params(x)


@router.post(Route.SET_SECTION_HIDE_UNPINNED_PARAMS)
async def route_set_section_hide_unpinned_params(
    x: SetSectionHideUnpinnedParamsRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_section_hide_unpinned_params(x)


@router.post(Route.SET_SECTION_PINNED_PARAMS)
async def route_set_section_pinned_params(
    x: SetSectionPinnedParamsRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_section_pinned_params(x)


@router.post(Route.SET_SECTION_PINNED_AREA_HEIGHT)
async def route_set_section_pinned_area_height(
    x: SetSectionPinnedAreaHeightRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_section_pinned_area_height(x)


@router.post(Route.SET_SECTION_COLUMN_WIDTH)
async def route_set_section_column_width(
    x: SetSectionColumnWidthRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_section_column_width(x)


@router.post(Route.SET_BROWSER_COLUMN_WIDTHS)
async def route_set_browser_column_widths(
    x: SetBrowserColumnWidthsRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_browser_column_widths(x)


@router.post(Route.SET_BROWSER_AREA_VIEW_MODE)
async def route_set_browser_area_view_mode(
    x: SetBrowserAreaViewModeRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_browser_area_view_mode(x)


@router.post(Route.SET_BROWSER_HIDE_COLUMN)
async def route_set_browser_hide_column(
    x: SetBrowserHideColumnRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_browser_hide_column(x)


@router.post(Route.SET_TEXT_BLOCK_FORMAT)
async def route_set_text_block_format(
    x: SetTextBlockFormatRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.set_text_block_format(x)


@router.post(Route.SET_SOCIAL_URL)
async def route_set_social_url(x: SetSocialUrlRequest, ctx: RuntimeContextFromRequest):
    await deny_in_share_mode(
        share_mode=ctx.share_mode,
        frontend_sender=ctx.frontend_sender,
        message="Share mode disallows social URL updates.",
        share_session_id=ctx.share_session_id,
    )
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.set_social_url(x)


@router.post(Route.MOVE_SECTION)
async def route_move_section(x: MoveSectionRequest, ctx: RuntimeContextFromRequest):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.layout)
    await manager.move_section(x)


@router.post(Route.GROUP_SECTIONS)
async def route_group_sections(x: GroupSectionsRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.group_sections(x)


@router.post(Route.UNGROUP_GROUPS)
async def route_ungroup_groups(x: UngroupGroupsRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.ungroup_groups(x)


@router.post(Route.TOGGLE_PARAM_SELECTED)
async def route_toggle_param_selected(
    x: ToggleParamSelectedRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.param)
    await manager.toggle_param_selected(x)


@router.post(Route.UNSELECT_ALL_PARAMS)
async def route_unselect_all_params(
    x: UnselectAllParamsRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.param)
    await manager.unselect_all_params(x)


@router.post(Route.PREPARE_SECTIONS_FOR_COPY)
async def route_prepare_sections_for_copy(
    x: PrepareSectionsForCopyRequest, ctx: RuntimeContextFromRequest
) -> SectionsClipboardData:
    return await ctx.get_project_manager(x.projectConfigId).prepare_sections_for_copy(x)


@router.post(Route.PASTE_SECTIONS)
async def route_paste_sections(x: PasteSectionsRequest, ctx: RuntimeContextFromRequest):
    await _deny_share_mode_structural(ctx)
    manager = ctx.get_project_manager(x.projectConfigId)
    await manager.paste_sections(x)


@router.post(Route.APPEND_DRAW_AREA_LAYER_ITEM)
async def route_append_draw_area_layer_item(
    x: AppendDrawAreaLayerItemRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.param)
    await manager.append_draw_area_layer_item(x)


@router.post(Route.SET_IMAGE_AREA_IMAGE_PATH)
async def route_set_image_area_image_path(
    x: SetImageAreaImagePathRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.param)
    await manager.set_image_area_image_path(x)


@router.post(Route.SET_CHART_AREA_IMAGE_PATH)
async def route_set_chart_area_data_path(
    x: SetChartAreaDataPathRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.param)
    await manager.set_chart_area_data_path(x)


@router.post(Route.SET_CHART_TYPE)
async def route_set_chart_type(x: SetChartTypeRequest, ctx: RuntimeContextFromRequest):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.param)
    await manager.set_chart_type(x)


@router.post(Route.SET_CHART_SETTINGS)
async def route_set_chart_settings(
    x: SetChartSettingsRequest, ctx: RuntimeContextFromRequest
):
    manager = ctx.get_project_manager(x.projectConfigId)
    await enforce_share_policy_guard(ctx, SharePolicyGuard.param)
    await manager.set_chart_settings(x)
