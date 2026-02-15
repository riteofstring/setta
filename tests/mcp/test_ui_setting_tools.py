from types import SimpleNamespace

import pytest
from mcp.server.fastmcp.server import Context

from setta.mcp.tools.ui_settings import (
    get_ui_setting_value,
    reveal_ui_setting,
    search_ui_settings,
    set_ui_setting_value,
)
from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    SetActiveIdsRequest,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.types.id import ID
from setta.types.section_impls import SectionType

from tests.utils.manager_fixture import real_project_manager, real_settings_manager


class _RecordingFrontendSender:
    def __init__(self) -> None:
        self.reveal_messages: list[tuple[object, str | None]] = []

    async def broadcast_ui_setting_reveal(
        self,
        content,
        *,
        share_session_id: str | None = None,
    ) -> None:
        self.reveal_messages.append((content, share_session_id))


def _build_ctx(
    *,
    main_manager,
    settings_manager,
    frontend_sender: _RecordingFrontendSender,
) -> Context:
    switcher = ProjectManagerSwitcher(
        main_manager=main_manager,
        settings_manager=settings_manager,
    )
    state = SimpleNamespace(
        project_manager_switcher=switcher,
        wmh_frontend_sender=frontend_sender,
    )
    return Context(fastmcp=SimpleNamespace(state=state))


@pytest.mark.asyncio
async def test_ui_setting_tools_core_flow() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        search_result = search_ui_settings(
            query="watch code toggle",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        result_ids = [entry.settingId for entry in search_result.results]
        assert "core.watch_code.enabled" in result_ids

        get_result = await get_ui_setting_value(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is None
        assert get_result.value in {True, False}

        original_value = bool(get_result.value)
        target_value = not original_value
        set_result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=target_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.changed is True
        assert set_result.newValue == target_value

        revert_result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=original_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert revert_result.error is None
        assert revert_result.newValue == original_value

        reveal_result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 1
        assert frontend_sender.reveal_messages
        reveal_content, reveal_share_session_id = frontend_sender.reveal_messages[0]
        assert reveal_share_session_id is None
        assert reveal_content.reveals[0].settingId == "core.watch_code.enabled"


@pytest.mark.asyncio
async def test_set_ui_setting_value_returns_structured_validation_error() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value="not-a-boolean",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "invalid_value_type"
        assert result.changed is False


@pytest.mark.asyncio
async def test_reveal_right_pane_setting_requires_active_section_or_override() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        # Right-pane reveals require a section context when none is active.
        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert len(result.statuses) == 1
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert "sectionIdToActivate" in result.statuses[0].error.message
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_reveal_right_pane_setting_activates_section_from_argument() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        manager = project_fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)

        create_result = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Dict,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        section_id = create_result.sectionId

        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=project_config_id,
                activeIds=[],
            )
        )

        # sectionIdToActivate allows right-pane reveal to choose the section context.
        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 1
        assert len(result.statuses) == 1
        assert result.statuses[0].status == "revealed"
        assert result.statuses[0].target is not None
        assert result.statuses[0].target.settingId == "core.project.show_param_display_names"

        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == [section_id]
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert reveal_content.reveals[0].settingId == "core.project.show_param_display_names"


@pytest.mark.asyncio
async def test_reveal_right_pane_setting_fails_for_unknown_section_override() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        # Unknown section IDs should fail before reveal emission.
        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=ID("missing-section"),
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert len(result.statuses) == 1
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert "Unknown section id" in result.statuses[0].error.message
        assert frontend_sender.reveal_messages == []
