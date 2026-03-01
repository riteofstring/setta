from dataclasses import dataclass

import pytest

from setta.project_state.project_manager_types import (
    CreateViewModeRequest,
    RedoRequest,
    SetActiveViewModeRequest,
    SetCallableHideParamsRequest,
    SetBrowserAreaViewModeRequest,
    SetBrowserColumnWidthsRequest,
    SetBrowserHideColumnRequest,
    SetBrowserSavedSearchesRequest,
    SetChatSectionStateRequest,
    SetGroupOverflowModeRequest,
    SetMetaControlShowSectionTitleRequest,
    SetSectionColumnWidthRequest,
    SetSectionHideUnpinnedParamsRequest,
    SetSectionParamFilterRequest,
    SetSectionPinnedParamsRequest,
    SetSectionSizesRequest,
    SetSectionStyleColorRequest,
    SetSectionTagColorRequest,
    SetSocialUrlRequest,
    SetTextBlockDisplayModeRequest,
    SetTextBlockFormatRequest,
    SetTextBlockMasterFontSizeRequest,
    SetTextBlockMetaControlStyleRequest,
    SetViewModeNameRequest,
    SetViewModeSortOrderRequest,
    ToggleIsEditingViewModeRequest,
    ToggleParamSelectedRequest,
    ToggleSectionVisibilityRequest,
    ToggleGroupOrientationRequest,
    ToggleMinimizedRequest,
    TogglePositionLocksRequest,
    ToggleViewModeTabRequest,
    ToggleViewModeUserFacingRequest,
    UndoRequest,
    UnselectAllParamsRequest,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    get_curr_top_level_param_ids,
)
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    BrowserAreaViewMode,
    BrowserSavedSearch,
    BrowserSectionImpl,
    CallableSectionImpl,
    ChatSectionImpl,
    ChatSectionState,
    GroupSectionImpl,
    MetaControlSectionImpl,
    SectionSize,
    SectionType,
    SocialSectionImpl,
    TextBlockDisplayMode,
    TextBlockFormat,
    TextBlockSectionImpl,
)
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


@dataclass(frozen=True)
class SectionIds:
    callable_section_id: ID
    group_section_id: ID
    browser_section_id: ID
    meta_control_section_id: ID
    text_block_section_id: ID
    social_section_id: ID
    chat_section_id: ID


def build_state_for_ui_only_fast_path() -> tuple[ProjectStateSingleConfig, SectionIds]:
    settings = SettingsState()
    project_state = build_callable_project_state(40)
    callable_section_id = ID("section-1")

    # Add one section for each endpoint family validated by this test.
    group_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Group,
        Position(x=900, y=0),
        core_overrides={"name": "fast_path_group"},
    )
    browser_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Browser,
        Position(x=1000, y=120),
        core_overrides={"name": "fast_path_browser"},
    )
    meta_control_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.MetaControl,
        Position(x=1050, y=180),
        core_overrides={"name": "fast_path_meta_control"},
    )
    text_block_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(x=1100, y=240),
        core_overrides={"name": "fast_path_text_block"},
    )
    social_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Social,
        Position(x=1200, y=360),
        core_overrides={"name": "fast_path_social"},
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(x=1300, y=480),
        core_overrides={"name": "fast_path_chat"},
    )

    return project_state, SectionIds(
        callable_section_id=callable_section_id,
        group_section_id=group_section_id,
        browser_section_id=browser_section_id,
        meta_control_section_id=meta_control_section_id,
        text_block_section_id=text_block_section_id,
        social_section_id=social_section_id,
        chat_section_id=chat_section_id,
    )


async def create_secondary_view_mode(
    manager,
    project_config_id: ID,
) -> tuple[ID, ID]:
    initial_state = manager.get_single_config_state(project_config_id)
    initial_active_view_mode_id = initial_state.projectConfig.activeViewModeId
    if initial_active_view_mode_id is None:
        raise KeyError("Active view mode is not set")
    secondary_view_mode_id = await manager.create_view_mode(
        CreateViewModeRequest(projectConfigId=project_config_id)
    )
    await manager.finish_pending_operations(timeout=5.0)
    return initial_active_view_mode_id, secondary_view_mode_id


@pytest.mark.asyncio
async def test_ui_only_routes_skip_full_codegen_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id
        top_level_param_ids = get_curr_top_level_param_ids(
            manager.get_single_config_state(project_config_id),
            section_ids.callable_section_id,
        )
        assert top_level_param_ids
        pinned_param_id = top_level_param_ids[0]
        default_view_mode_id, secondary_view_mode_id = await create_secondary_view_mode(
            manager, project_config_id
        )

        refresh_calls = 0
        original_refresh = manager._refresh_codegen_state

        async def record_refresh(next_state):
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        try:

            async def assert_refresh_delta(expected_delta: int, operation_coro) -> None:
                # Drain queued/background work so the delta only reflects this call.
                await manager.finish_pending_operations(timeout=5.0)
                before = refresh_calls
                await operation_coro
                await manager.finish_pending_operations(timeout=5.0)
                assert refresh_calls - before == expected_delta

            # These routes should only merge and broadcast UI state updates.
            await assert_refresh_delta(
                0,
                manager.toggle_position_locks(
                    TogglePositionLocksRequest(
                        projectConfigId=project_config_id,
                        sectionIds=[section_ids.callable_section_id],
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.toggle_minimized(
                    ToggleMinimizedRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.toggle_group_orientation(
                    ToggleGroupOrientationRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.group_section_id,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_group_overflow_mode(
                    SetGroupOverflowModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.group_section_id,
                        overflowMode=True,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_section_tag_color(
                    SetSectionTagColorRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        tagColor="#ef4444",
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_section_style_color(
                    SetSectionStyleColorRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        styleColor="#22c55e",
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_section_sizes(
                    SetSectionSizesRequest(
                        projectConfigId=project_config_id,
                        sectionSizes={
                            section_ids.callable_section_id: SectionSize(
                                width=640.0,
                                height=420.0,
                            )
                        },
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_section_column_width(
                    SetSectionColumnWidthRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        columnWidth=244.0,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_section_param_filter(
                    SetSectionParamFilterRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        value="fast-path-filter",
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_callable_hide_params(
                    SetCallableHideParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        hideParams=True,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_section_hide_unpinned_params(
                    SetSectionHideUnpinnedParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        hideUnpinnedParams=True,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_section_pinned_params(
                    SetSectionPinnedParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        pinnedParams=[pinned_param_id],
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.toggle_param_selected(
                    ToggleParamSelectedRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        paramInfoId=pinned_param_id,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.unselect_all_params(
                    UnselectAllParamsRequest(projectConfigId=project_config_id)
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_meta_control_show_section_title(
                    SetMetaControlShowSectionTitleRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.meta_control_section_id,
                        showSectionTitle=True,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_browser_column_widths(
                    SetBrowserColumnWidthsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        columnWidth=280.0,
                        typesColumnWidth=120.0,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_browser_area_view_mode(
                    SetBrowserAreaViewModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        viewMode=BrowserAreaViewMode.thumbnail,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_browser_hide_column(
                    SetBrowserHideColumnRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        hideColumn=True,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_browser_saved_searches(
                    SetBrowserSavedSearchesRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        savedSearches=[BrowserSavedSearch(name="docs", query="README")],
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_text_block_format(
                    SetTextBlockFormatRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.text_block_section_id,
                        format=TextBlockFormat.Markdown,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_text_block_display_mode(
                    SetTextBlockDisplayModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.text_block_section_id,
                        textDisplayMode=TextBlockDisplayMode.Edit,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_text_block_master_font_size(
                    SetTextBlockMasterFontSizeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.text_block_section_id,
                        masterFontSizePx=23.0,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_text_block_meta_control_style(
                    SetTextBlockMetaControlStyleRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.text_block_section_id,
                        metaControlStyle=True,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_social_url(
                    SetSocialUrlRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.social_section_id,
                        url="https://example.com",
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_active_view_mode(
                    SetActiveViewModeRequest(
                        projectConfigId=project_config_id,
                        activeViewModeId=default_view_mode_id,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.toggle_is_editing_view_mode(
                    ToggleIsEditingViewModeRequest(projectConfigId=project_config_id)
                ),
            )
            await assert_refresh_delta(
                0,
                manager.toggle_section_visibility(
                    ToggleSectionVisibilityRequest(
                        projectConfigId=project_config_id,
                        sectionIds=[
                            section_ids.callable_section_id,
                            section_ids.meta_control_section_id,
                        ],
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.toggle_view_mode_user_facing(
                    ToggleViewModeUserFacingRequest(
                        projectConfigId=project_config_id,
                        viewModeId=secondary_view_mode_id,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.toggle_view_mode_tab(
                    ToggleViewModeTabRequest(
                        projectConfigId=project_config_id,
                        viewModeId=secondary_view_mode_id,
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_view_mode_name(
                    SetViewModeNameRequest(
                        projectConfigId=project_config_id,
                        viewModeId=secondary_view_mode_id,
                        name="secondary-fast-path",
                    )
                ),
            )
            await assert_refresh_delta(
                0,
                manager.set_view_mode_sort_order(
                    SetViewModeSortOrderRequest(
                        projectConfigId=project_config_id,
                        orderedViewModeIds=[
                            secondary_view_mode_id,
                            default_view_mode_id,
                        ],
                    )
                ),
            )
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]

        # Confirm each route mutation persisted correctly.
        updated = manager.get_single_config_state(project_config_id)
        callable_impl = get_curr_effective_section_impl_with_type_guard(
            updated,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert callable_impl.positionAndSizeLocked is True
        assert callable_impl.isMinimized is True
        assert callable_impl.tagColor == "#ef4444"
        assert callable_impl.styleColor == "#22c55e"
        assert callable_impl.size.width == 640.0
        assert callable_impl.size.height == 420.0
        assert callable_impl.columnWidth == 244.0
        assert callable_impl.paramFilter == "fast-path-filter"
        assert callable_impl.hideParams is True
        assert callable_impl.hideUnpinnedParams is True
        assert callable_impl.pinnedParams == [pinned_param_id]
        assert callable_impl.selectedParams == []
        callable_variant_id = updated.projectConfig.sectionVariantMap[
            section_ids.callable_section_id
        ]
        callable_shown = updated.shownParamIds[callable_variant_id]
        assert pinned_param_id in callable_shown.pinned.requiredParamIdsToPaths

        group_impl = get_curr_effective_section_impl_with_type_guard(
            updated, section_ids.group_section_id, GroupSectionImpl
        )
        assert group_impl.isHorizontalOrientation is True
        assert group_impl.overflowMode is True

        browser_impl = get_curr_effective_section_impl_with_type_guard(
            updated, section_ids.browser_section_id, BrowserSectionImpl
        )
        assert browser_impl.columnWidth == 280.0
        assert browser_impl.typesColumnWidth == 120.0
        assert browser_impl.viewMode == BrowserAreaViewMode.thumbnail
        assert browser_impl.hideColumn is True
        assert len(browser_impl.savedSearches) == 1
        assert browser_impl.savedSearches[0].query == "README"

        text_block_impl = get_curr_effective_section_impl_with_type_guard(
            updated, section_ids.text_block_section_id, TextBlockSectionImpl
        )
        assert text_block_impl.textDisplayMode == TextBlockDisplayMode.Edit
        assert text_block_impl.masterFontSizePx == 23.0
        assert text_block_impl.metaControlStyle is True
        assert text_block_impl.format == TextBlockFormat.Markdown

        meta_control_impl = get_curr_effective_section_impl_with_type_guard(
            updated, section_ids.meta_control_section_id, MetaControlSectionImpl
        )
        assert meta_control_impl.showSectionTitle is True

        social_impl = get_curr_effective_section_impl_with_type_guard(
            updated, section_ids.social_section_id, SocialSectionImpl
        )
        assert social_impl.url == "https://example.com"

        assert updated.projectConfig.activeViewModeId == default_view_mode_id
        assert updated.projectConfig.isEditingViewMode is False
        default_view_mode = updated.projectConfig.viewModes[default_view_mode_id]
        secondary_view_mode = updated.projectConfig.viewModes[secondary_view_mode_id]
        assert (
            default_view_mode.visibilityBySectionId[section_ids.callable_section_id]
            is False
        )
        assert (
            default_view_mode.visibilityBySectionId[section_ids.meta_control_section_id]
            is False
        )
        assert secondary_view_mode.isUserFacing is True
        assert secondary_view_mode.isTab is True
        assert secondary_view_mode.name == "secondary-fast-path"
        assert secondary_view_mode.sortIndex == 0
        assert default_view_mode.sortIndex == 1


@pytest.mark.asyncio
async def test_chat_section_state_still_triggers_full_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        original_refresh = manager._refresh_codegen_state

        async def record_refresh(next_state):
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before = refresh_calls
            # Chat state contributes to dependency graph/codegen value output.
            await manager.set_chat_section_state(
                SetChatSectionStateRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_ids.chat_section_id,
                    state=ChatSectionState(inputText="hello"),
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]

        assert refresh_calls - before > 0
        updated = manager.get_single_config_state(project_config_id)
        chat_impl = get_curr_effective_section_impl_with_type_guard(
            updated, section_ids.chat_section_id, ChatSectionImpl
        )
        assert chat_impl.inputText == "hello"


@pytest.mark.asyncio
async def test_ui_only_routes_skip_file_watcher_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id
        top_level_param_ids = get_curr_top_level_param_ids(
            manager.get_single_config_state(project_config_id),
            section_ids.callable_section_id,
        )
        assert top_level_param_ids
        pinned_param_id = top_level_param_ids[0]
        default_view_mode_id, secondary_view_mode_id = await create_secondary_view_mode(
            manager, project_config_id
        )

        json_source_watch_calls = 0
        artifact_watch_calls = 0
        code_watch_calls = 0
        original_watch_json_source_files = manager.watch_json_source_files
        original_watch_artifact_files = manager.watch_artifact_files
        original_watch_code_files = manager.watch_code_files

        def record_watch_json_source_files() -> None:
            nonlocal json_source_watch_calls
            json_source_watch_calls += 1
            original_watch_json_source_files()

        def record_watch_artifact_files() -> None:
            nonlocal artifact_watch_calls
            artifact_watch_calls += 1
            original_watch_artifact_files()

        def record_watch_code_files(*args, **kwargs) -> None:
            nonlocal code_watch_calls
            code_watch_calls += 1
            original_watch_code_files(*args, **kwargs)

        manager.watch_json_source_files = record_watch_json_source_files  # type: ignore[method-assign]
        manager.watch_artifact_files = record_watch_artifact_files  # type: ignore[method-assign]
        manager.watch_code_files = record_watch_code_files  # type: ignore[method-assign]
        try:

            async def assert_watcher_delta(expected_delta: int, operation_coro) -> None:
                # Drain queued/background work so deltas only reflect this call.
                await manager.finish_pending_operations(timeout=5.0)
                before_json = json_source_watch_calls
                before_artifact = artifact_watch_calls
                before_code = code_watch_calls
                await operation_coro
                await manager.finish_pending_operations(timeout=5.0)
                assert json_source_watch_calls - before_json == expected_delta
                assert artifact_watch_calls - before_artifact == expected_delta
                assert code_watch_calls - before_code == expected_delta

            # Fast-path routes should persist and broadcast without watcher refresh.
            await assert_watcher_delta(
                0,
                manager.toggle_position_locks(
                    TogglePositionLocksRequest(
                        projectConfigId=project_config_id,
                        sectionIds=[section_ids.callable_section_id],
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.toggle_minimized(
                    ToggleMinimizedRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.toggle_group_orientation(
                    ToggleGroupOrientationRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.group_section_id,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_group_overflow_mode(
                    SetGroupOverflowModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.group_section_id,
                        overflowMode=True,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_section_tag_color(
                    SetSectionTagColorRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        tagColor="#ef4444",
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_section_style_color(
                    SetSectionStyleColorRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        styleColor="#22c55e",
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_section_sizes(
                    SetSectionSizesRequest(
                        projectConfigId=project_config_id,
                        sectionSizes={
                            section_ids.callable_section_id: SectionSize(
                                width=610.0,
                                height=390.0,
                            )
                        },
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_section_column_width(
                    SetSectionColumnWidthRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        columnWidth=233.0,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_section_param_filter(
                    SetSectionParamFilterRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        value="watcher-filter",
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_callable_hide_params(
                    SetCallableHideParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        hideParams=True,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_section_hide_unpinned_params(
                    SetSectionHideUnpinnedParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        hideUnpinnedParams=True,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_section_pinned_params(
                    SetSectionPinnedParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        pinnedParams=[pinned_param_id],
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.toggle_param_selected(
                    ToggleParamSelectedRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        paramInfoId=pinned_param_id,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.unselect_all_params(
                    UnselectAllParamsRequest(projectConfigId=project_config_id)
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_meta_control_show_section_title(
                    SetMetaControlShowSectionTitleRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.meta_control_section_id,
                        showSectionTitle=True,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_browser_column_widths(
                    SetBrowserColumnWidthsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        columnWidth=280.0,
                        typesColumnWidth=120.0,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_browser_area_view_mode(
                    SetBrowserAreaViewModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        viewMode=BrowserAreaViewMode.thumbnail,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_browser_hide_column(
                    SetBrowserHideColumnRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        hideColumn=True,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_browser_saved_searches(
                    SetBrowserSavedSearchesRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        savedSearches=[BrowserSavedSearch(name="docs", query="README")],
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_text_block_format(
                    SetTextBlockFormatRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.text_block_section_id,
                        format=TextBlockFormat.Markdown,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_text_block_display_mode(
                    SetTextBlockDisplayModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.text_block_section_id,
                        textDisplayMode=TextBlockDisplayMode.Edit,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_text_block_master_font_size(
                    SetTextBlockMasterFontSizeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.text_block_section_id,
                        masterFontSizePx=23.0,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_text_block_meta_control_style(
                    SetTextBlockMetaControlStyleRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.text_block_section_id,
                        metaControlStyle=True,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_social_url(
                    SetSocialUrlRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.social_section_id,
                        url="https://example.com",
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_active_view_mode(
                    SetActiveViewModeRequest(
                        projectConfigId=project_config_id,
                        activeViewModeId=default_view_mode_id,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.toggle_is_editing_view_mode(
                    ToggleIsEditingViewModeRequest(projectConfigId=project_config_id)
                ),
            )
            await assert_watcher_delta(
                0,
                manager.toggle_section_visibility(
                    ToggleSectionVisibilityRequest(
                        projectConfigId=project_config_id,
                        sectionIds=[
                            section_ids.callable_section_id,
                            section_ids.meta_control_section_id,
                        ],
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.toggle_view_mode_user_facing(
                    ToggleViewModeUserFacingRequest(
                        projectConfigId=project_config_id,
                        viewModeId=secondary_view_mode_id,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.toggle_view_mode_tab(
                    ToggleViewModeTabRequest(
                        projectConfigId=project_config_id,
                        viewModeId=secondary_view_mode_id,
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_view_mode_name(
                    SetViewModeNameRequest(
                        projectConfigId=project_config_id,
                        viewModeId=secondary_view_mode_id,
                        name="secondary-fast-path",
                    )
                ),
            )
            await assert_watcher_delta(
                0,
                manager.set_view_mode_sort_order(
                    SetViewModeSortOrderRequest(
                        projectConfigId=project_config_id,
                        orderedViewModeIds=[
                            secondary_view_mode_id,
                            default_view_mode_id,
                        ],
                    )
                ),
            )
        finally:
            manager.watch_json_source_files = original_watch_json_source_files  # type: ignore[method-assign]
            manager.watch_artifact_files = original_watch_artifact_files  # type: ignore[method-assign]
            manager.watch_code_files = original_watch_code_files  # type: ignore[method-assign]


@pytest.mark.asyncio
async def test_ui_only_fast_path_broadcasts_project_state_only() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id
        top_level_param_ids = get_curr_top_level_param_ids(
            manager.get_single_config_state(project_config_id),
            section_ids.callable_section_id,
        )
        assert top_level_param_ids
        pinned_param_id = top_level_param_ids[0]

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        name_validation_broadcast_calls = 0
        original_project_state_broadcast = sender.broadcast_project_state
        original_name_validation_broadcast = sender.broadcast_name_validation_errors

        async def record_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal project_state_broadcast_calls
            project_state_broadcast_calls += 1
            await original_project_state_broadcast(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_name_validation_broadcast(content) -> None:
            nonlocal name_validation_broadcast_calls
            name_validation_broadcast_calls += 1
            await original_name_validation_broadcast(content)

        sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]
        try:
            # Routes that still use project-state snapshots should not regress.
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            before_name_validation = name_validation_broadcast_calls
            await manager.set_section_pinned_params(
                SetSectionPinnedParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_ids.callable_section_id,
                    pinnedParams=[pinned_param_id],
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
            sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

        assert project_state_broadcast_calls - before_project_state == 1
        assert name_validation_broadcast_calls - before_name_validation == 0


@pytest.mark.asyncio
async def test_ui_only_section_size_routes_broadcast_section_impl_patch() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        section_impl_patch_calls: list[dict[str, object]] = []
        original_project_state_broadcast = sender.broadcast_project_state
        original_section_impl_patch_broadcast = (
            sender.broadcast_project_state_section_impl_patch
        )

        async def record_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal project_state_broadcast_calls
            project_state_broadcast_calls += 1
            await original_project_state_broadcast(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_section_impl_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            section_impl_patch_calls.append(
                {
                    "projectConfigId": project_config_id_for_patch,
                    "sectionId": section_id_for_patch,
                    "sectionImplId": section_impl_for_patch.id,
                    "sectionImplType": section_impl_for_patch.type,
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                    "completedOpIds": list(completed_op_ids),
                    "pendingOpIds": list(pending_op_ids),
                }
            )
            await original_section_impl_patch_broadcast(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = record_section_impl_patch  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            before_patch_count = len(section_impl_patch_calls)

            await manager.set_section_column_width(
                SetSectionColumnWidthRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_ids.callable_section_id,
                    columnWidth=240.0,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)

            column_width_patches = section_impl_patch_calls[before_patch_count:]
            assert len(column_width_patches) == 1
            column_patch = column_width_patches[0]
            assert column_patch["projectConfigId"] == project_config_id
            assert column_patch["sectionId"] == section_ids.callable_section_id
            assert column_patch["sectionImplType"] == SectionType.Callable
            assert (
                int(column_patch["previousProjectStateRevision"])
                < int(column_patch["projectStateRevision"])
            )

            await manager.set_section_sizes(
                SetSectionSizesRequest(
                    projectConfigId=project_config_id,
                    sectionSizes={
                        section_ids.callable_section_id: SectionSize(
                            width=640.0,
                            height=440.0,
                        ),
                        section_ids.browser_section_id: SectionSize(
                            width=720.0,
                            height=470.0,
                        ),
                    },
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
            sender.broadcast_project_state_section_impl_patch = (
                original_section_impl_patch_broadcast  # type: ignore[method-assign]
            )

        assert project_state_broadcast_calls == before_project_state
        size_patches = section_impl_patch_calls[before_patch_count + 1 :]
        assert len(size_patches) == 2
        assert {
            patch["sectionId"] for patch in size_patches
        } == {section_ids.callable_section_id, section_ids.browser_section_id}
        assert size_patches[0]["projectStateRevision"] == size_patches[1][
            "projectStateRevision"
        ]
        assert (
            int(size_patches[0]["previousProjectStateRevision"])
            < int(size_patches[0]["projectStateRevision"])
        )
        assert (
            int(size_patches[1]["previousProjectStateRevision"])
            == int(size_patches[1]["projectStateRevision"])
        )


@pytest.mark.asyncio
async def test_ui_only_param_visibility_routes_broadcast_section_impl_patch() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        section_impl_patch_calls: list[dict[str, int | str | list[str]]] = []
        original_project_state_broadcast = sender.broadcast_project_state
        original_section_impl_patch_broadcast = (
            sender.broadcast_project_state_section_impl_patch
        )

        async def record_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal project_state_broadcast_calls
            project_state_broadcast_calls += 1
            await original_project_state_broadcast(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_section_impl_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            section_impl_patch_calls.append(
                {
                    "projectConfigId": project_config_id_for_patch,
                    "sectionId": section_id_for_patch,
                    "sectionImplId": section_impl_for_patch.id,
                    "sectionImplType": section_impl_for_patch.type,
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                    "completedOpIds": list(completed_op_ids),
                    "pendingOpIds": list(pending_op_ids),
                }
            )
            await original_section_impl_patch_broadcast(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = record_section_impl_patch  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            before_patch_count = len(section_impl_patch_calls)

            await manager.set_section_param_filter(
                SetSectionParamFilterRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_ids.callable_section_id,
                    value="param-filter-patch",
                )
            )
            await manager.set_callable_hide_params(
                SetCallableHideParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_ids.callable_section_id,
                    hideParams=True,
                )
            )
            await manager.set_section_hide_unpinned_params(
                SetSectionHideUnpinnedParamsRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_ids.callable_section_id,
                    hideUnpinnedParams=True,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
            sender.broadcast_project_state_section_impl_patch = (
                original_section_impl_patch_broadcast  # type: ignore[method-assign]
            )

        assert project_state_broadcast_calls == before_project_state
        patches = section_impl_patch_calls[before_patch_count:]
        assert len(patches) == 3
        assert {patch["projectConfigId"] for patch in patches} == {project_config_id}
        assert {patch["sectionId"] for patch in patches} == {
            section_ids.callable_section_id
        }
        assert {patch["sectionImplType"] for patch in patches} == {SectionType.Callable}
        for patch in patches:
            assert patch["previousProjectStateRevision"] < patch["projectStateRevision"]


@pytest.mark.asyncio
async def test_ui_only_text_chrome_routes_broadcast_section_impl_patch() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        section_impl_patch_calls: list[dict[str, int | str | list[str]]] = []
        original_project_state_broadcast = sender.broadcast_project_state
        original_section_impl_patch_broadcast = (
            sender.broadcast_project_state_section_impl_patch
        )

        async def record_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal project_state_broadcast_calls
            project_state_broadcast_calls += 1
            await original_project_state_broadcast(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_section_impl_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            section_impl_patch_calls.append(
                {
                    "projectConfigId": project_config_id_for_patch,
                    "sectionId": section_id_for_patch,
                    "sectionImplId": section_impl_for_patch.id,
                    "sectionImplType": section_impl_for_patch.type,
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                    "completedOpIds": list(completed_op_ids),
                    "pendingOpIds": list(pending_op_ids),
                }
            )
            await original_section_impl_patch_broadcast(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = record_section_impl_patch  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            await manager.set_text_block_display_mode(
                SetTextBlockDisplayModeRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_ids.text_block_section_id,
                    textDisplayMode=TextBlockDisplayMode.Edit,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
            sender.broadcast_project_state_section_impl_patch = (
                original_section_impl_patch_broadcast  # type: ignore[method-assign]
            )

        assert project_state_broadcast_calls == before_project_state
        assert 1 == len(section_impl_patch_calls)
        patch = section_impl_patch_calls[0]
        assert patch["projectConfigId"] == project_config_id
        assert patch["sectionId"] == section_ids.text_block_section_id
        assert patch["sectionImplType"] == SectionType.TextBlock
        assert patch["previousProjectStateRevision"] < patch["projectStateRevision"]


@pytest.mark.asyncio
async def test_ui_only_fast_path_preserves_undo_redo_with_coalescing() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        baseline = manager.get_single_config_state(project_config_id)
        baseline_callable = get_curr_effective_section_impl_with_type_guard(
            baseline,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        baseline_browser = get_curr_effective_section_impl_with_type_guard(
            baseline, section_ids.browser_section_id, BrowserSectionImpl
        )
        baseline_style_color = baseline_callable.styleColor
        baseline_column_width = baseline_browser.columnWidth
        baseline_types_column_width = baseline_browser.typesColumnWidth

        # Style-color writes share a coalesce key and should collapse into one undo step.
        await manager.set_section_style_color(
            SetSectionStyleColorRequest(
                projectConfigId=project_config_id,
                sectionId=section_ids.callable_section_id,
                styleColor="#111827",
            )
        )
        await manager.set_section_style_color(
            SetSectionStyleColorRequest(
                projectConfigId=project_config_id,
                sectionId=section_ids.callable_section_id,
                styleColor="#6366f1",
            )
        )
        await manager.set_browser_column_widths(
            SetBrowserColumnWidthsRequest(
                projectConfigId=project_config_id,
                sectionId=section_ids.browser_section_id,
                columnWidth=301.0,
                typesColumnWidth=149.0,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        changed = manager.get_single_config_state(project_config_id)
        changed_callable = get_curr_effective_section_impl_with_type_guard(
            changed,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        changed_browser = get_curr_effective_section_impl_with_type_guard(
            changed, section_ids.browser_section_id, BrowserSectionImpl
        )
        assert changed_callable.styleColor == "#6366f1"
        assert changed_browser.columnWidth == 301.0
        assert changed_browser.typesColumnWidth == 149.0

        # First undo reverts the most recent browser-width mutation only.
        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        after_first_undo = manager.get_single_config_state(project_config_id)
        after_first_undo_callable = get_curr_effective_section_impl_with_type_guard(
            after_first_undo,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        after_first_undo_browser = get_curr_effective_section_impl_with_type_guard(
            after_first_undo, section_ids.browser_section_id, BrowserSectionImpl
        )
        assert after_first_undo_callable.styleColor == "#6366f1"
        assert after_first_undo_browser.columnWidth == baseline_column_width
        assert after_first_undo_browser.typesColumnWidth == baseline_types_column_width

        # Second undo should remove both style-color edits as one coalesced step.
        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        after_second_undo = manager.get_single_config_state(project_config_id)
        after_second_undo_callable = get_curr_effective_section_impl_with_type_guard(
            after_second_undo,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert after_second_undo_callable.styleColor == baseline_style_color

        # Redo should replay style-color then browser-width mutations in order.
        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        after_first_redo = manager.get_single_config_state(project_config_id)
        after_first_redo_callable = get_curr_effective_section_impl_with_type_guard(
            after_first_redo,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert after_first_redo_callable.styleColor == "#6366f1"

        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        after_second_redo = manager.get_single_config_state(project_config_id)
        after_second_redo_browser = get_curr_effective_section_impl_with_type_guard(
            after_second_redo,
            section_ids.browser_section_id,
            BrowserSectionImpl,
        )
        assert after_second_redo_browser.columnWidth == 301.0
        assert after_second_redo_browser.typesColumnWidth == 149.0


@pytest.mark.asyncio
async def test_ui_only_section_size_routes_preserve_undo_redo_with_coalescing() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        baseline = manager.get_single_config_state(project_config_id)
        baseline_callable = get_curr_effective_section_impl_with_type_guard(
            baseline,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        baseline_size_width = baseline_callable.size.width
        baseline_size_height = baseline_callable.size.height
        baseline_column_width = baseline_callable.columnWidth

        # Section-size writes share a coalesce key and should collapse into one
        # undo step when resizing the same set of sections.
        await manager.set_section_sizes(
            SetSectionSizesRequest(
                projectConfigId=project_config_id,
                sectionSizes={
                    section_ids.callable_section_id: SectionSize(
                        width=620.0,
                        height=430.0,
                    )
                },
            )
        )
        await manager.set_section_sizes(
            SetSectionSizesRequest(
                projectConfigId=project_config_id,
                sectionSizes={
                    section_ids.callable_section_id: SectionSize(
                        width=700.0,
                        height=500.0,
                    )
                },
            )
        )
        # Column-width writes use their own coalesce key and should become the
        # next undo step after section-size changes.
        await manager.set_section_column_width(
            SetSectionColumnWidthRequest(
                projectConfigId=project_config_id,
                sectionId=section_ids.callable_section_id,
                columnWidth=210.0,
            )
        )
        await manager.set_section_column_width(
            SetSectionColumnWidthRequest(
                projectConfigId=project_config_id,
                sectionId=section_ids.callable_section_id,
                columnWidth=330.0,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        changed = manager.get_single_config_state(project_config_id)
        changed_callable = get_curr_effective_section_impl_with_type_guard(
            changed,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert changed_callable.size.width == 700.0
        assert changed_callable.size.height == 500.0
        assert changed_callable.columnWidth == 330.0

        # First undo should revert only the latest coalesced column-width step.
        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        after_first_undo = manager.get_single_config_state(project_config_id)
        after_first_undo_callable = get_curr_effective_section_impl_with_type_guard(
            after_first_undo,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert after_first_undo_callable.size.width == 700.0
        assert after_first_undo_callable.size.height == 500.0
        assert after_first_undo_callable.columnWidth == baseline_column_width

        # Second undo should revert the coalesced section-size step.
        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        after_second_undo = manager.get_single_config_state(project_config_id)
        after_second_undo_callable = get_curr_effective_section_impl_with_type_guard(
            after_second_undo,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert after_second_undo_callable.size.width == baseline_size_width
        assert after_second_undo_callable.size.height == baseline_size_height
        assert after_second_undo_callable.columnWidth == baseline_column_width

        # Redo should replay section-size then column-width updates in order.
        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        after_first_redo = manager.get_single_config_state(project_config_id)
        after_first_redo_callable = get_curr_effective_section_impl_with_type_guard(
            after_first_redo,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert after_first_redo_callable.size.width == 700.0
        assert after_first_redo_callable.size.height == 500.0
        assert after_first_redo_callable.columnWidth == baseline_column_width

        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        after_second_redo = manager.get_single_config_state(project_config_id)
        after_second_redo_callable = get_curr_effective_section_impl_with_type_guard(
            after_second_redo,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert after_second_redo_callable.size.width == 700.0
        assert after_second_redo_callable.size.height == 500.0
        assert after_second_redo_callable.columnWidth == 330.0


@pytest.mark.asyncio
async def test_set_section_pinned_params_fast_path_matches_full_validation() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = build_state_for_ui_only_fast_path()
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        param_ids = get_curr_top_level_param_ids(
            manager.get_single_config_state(project_config_id),
            section_ids.callable_section_id,
        )
        assert param_ids
        pinned_param_id = param_ids[0]

        await manager.set_section_pinned_params(
            SetSectionPinnedParamsRequest(
                projectConfigId=project_config_id,
                sectionId=section_ids.callable_section_id,
                pinnedParams=[pinned_param_id],
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        fast_state = manager.get_single_config_state(project_config_id)
        fully_validated_state = fast_state.model_copy(deep=True)
        fully_validated_state.validate_for_update(
            validate_code_file_bindings=True,
            validate_name_rules=False,
        )

        assert fast_state.shownParamIds == fully_validated_state.shownParamIds
