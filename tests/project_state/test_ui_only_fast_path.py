from dataclasses import dataclass

import pytest

from setta.project_state.project_manager_types import (
    SetBrowserAreaViewModeRequest,
    SetBrowserColumnWidthsRequest,
    SetBrowserHideColumnRequest,
    SetBrowserSavedSearchesRequest,
    SetChatSectionStateRequest,
    SetGroupOverflowModeRequest,
    SetSectionStyleColorRequest,
    SetSectionTagColorRequest,
    SetSocialUrlRequest,
    SetTextBlockFormatRequest,
    ToggleGroupOrientationRequest,
    ToggleMinimizedRequest,
    TogglePositionLocksRequest,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import create_top_level_section
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
    SectionType,
    SocialSectionImpl,
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
        text_block_section_id=text_block_section_id,
        social_section_id=social_section_id,
        chat_section_id=chat_section_id,
    )


@pytest.mark.asyncio
async def test_ui_only_routes_skip_full_codegen_refresh() -> None:
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
                )
            )
            await assert_refresh_delta(
                0,
                manager.toggle_minimized(
                    ToggleMinimizedRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                    )
                )
            )
            await assert_refresh_delta(
                0,
                manager.toggle_group_orientation(
                    ToggleGroupOrientationRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.group_section_id,
                    )
                )
            )
            await assert_refresh_delta(
                0,
                manager.set_group_overflow_mode(
                    SetGroupOverflowModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.group_section_id,
                        overflowMode=True,
                    )
                )
            )
            await assert_refresh_delta(
                0,
                manager.set_section_tag_color(
                    SetSectionTagColorRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        tagColor="#ef4444",
                    )
                )
            )
            await assert_refresh_delta(
                0,
                manager.set_section_style_color(
                    SetSectionStyleColorRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        styleColor="#22c55e",
                    )
                )
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
                )
            )
            await assert_refresh_delta(
                0,
                manager.set_browser_area_view_mode(
                    SetBrowserAreaViewModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        viewMode=BrowserAreaViewMode.thumbnail,
                    )
                )
            )
            await assert_refresh_delta(
                0,
                manager.set_browser_hide_column(
                    SetBrowserHideColumnRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        hideColumn=True,
                    )
                )
            )
            await assert_refresh_delta(
                0,
                manager.set_browser_saved_searches(
                    SetBrowserSavedSearchesRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        savedSearches=[BrowserSavedSearch(name="docs", query="README")],
                    )
                )
            )
            await assert_refresh_delta(
                0,
                manager.set_text_block_format(
                    SetTextBlockFormatRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.text_block_section_id,
                        format=TextBlockFormat.Markdown,
                    )
                )
            )
            await assert_refresh_delta(
                0,
                manager.set_social_url(
                    SetSocialUrlRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.social_section_id,
                        url="https://example.com",
                    )
                )
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
        assert text_block_impl.format == TextBlockFormat.Markdown

        social_impl = get_curr_effective_section_impl_with_type_guard(
            updated, section_ids.social_section_id, SocialSectionImpl
        )
        assert social_impl.url == "https://example.com"


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
