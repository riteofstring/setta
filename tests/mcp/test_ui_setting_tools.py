from types import SimpleNamespace

import pytest
from mcp.server.fastmcp.server import Context

from setta.mcp.errors import InvalidToolArgumentsError
from setta.mcp.tools.ui_settings import (
    get_ui_setting_value,
    reveal_ui_setting,
    search_ui_settings,
    set_ui_setting_value,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.types.id import ID
from setta.types.websocket import (
    UISettingRevealResultContent,
    UISettingRevealResultStatus,
)
from setta.ui_settings.reveal_result_hub import UISettingRevealResultHub

from tests.utils.manager_fixture import real_project_manager, real_settings_manager


class _FrontendSenderHarness:
    def __init__(self) -> None:
        self.reveal_messages: list[tuple[object, str | None]] = []
        self.reveal_result_hub = UISettingRevealResultHub()

    def resolve_frontend_websocket_id_from_affinity_token(
        self,
        *,
        affinity_token: str,
        share_session_id: str | None = None,  # noqa: ARG002
    ) -> str | None:
        return affinity_token if affinity_token == "frontend-test" else None

    def select_frontend_websocket_for_ui_setting_reveal(
        self,
        *,
        share_session_id: str | None = None,  # noqa: ARG002
        preferred_websocket_id: str | None = None,
    ) -> str | None:
        if preferred_websocket_id is not None:
            return preferred_websocket_id
        return "frontend-test"

    def list_frontend_websocket_ids_for_ui_setting_reveal(
        self,
        *,
        share_session_id: str | None = None,  # noqa: ARG002
    ) -> list[str]:
        return ["frontend-test"]

    async def broadcast_ui_setting_reveal(
        self,
        content,
        *,
        share_session_id: str | None = None,
        target_websocket_id: str | None = None,
    ) -> str | None:
        resolved_target_websocket_id = (
            target_websocket_id if target_websocket_id is not None else "frontend-test"
        )
        self.reveal_messages.append((content, share_session_id))
        self.reveal_result_hub.resolve(
            UISettingRevealResultContent(
                projectConfigId=content.projectConfigId,
                requestId=content.requestId,
                statuses=[
                    UISettingRevealResultStatus(
                        settingId=target.settingId,
                        status="revealed",
                        errorCode=None,
                        errorMessage=None,
                    )
                    for target in content.reveals
                ],
            ),
            from_websocket_id=resolved_target_websocket_id,
        )
        return resolved_target_websocket_id


def _build_ctx(*, main_manager, settings_manager) -> tuple[Context, _FrontendSenderHarness]:
    frontend_sender = _FrontendSenderHarness()
    state = SimpleNamespace(
        project_manager_switcher=ProjectManagerSwitcher(
            main_manager=main_manager,
            settings_manager=settings_manager,
        ),
        wmh_frontend_sender=frontend_sender,
        ui_setting_reveal_result_hub=frontend_sender.reveal_result_hub,
        deployment_mode=False,
    )
    return Context(fastmcp=SimpleNamespace(state=state)), frontend_sender


@pytest.mark.asyncio
async def test_ui_setting_tools_core_flow() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        ctx, frontend_sender = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        # Core Python MCP tools should still support the basic search/get/set/reveal flow.
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
        assert reveal_result.statuses[0].status == "revealed"
        assert frontend_sender.reveal_messages


def test_search_ui_settings_rejects_blank_query() -> None:
    # The tool should keep rejecting empty search queries even after the plugin cut.
    with pytest.raises(InvalidToolArgumentsError, match="query must not be empty"):
        search_ui_settings(
            query="   ",
            ctx=Context(fastmcp=SimpleNamespace(state=SimpleNamespace())),
        )


@pytest.mark.asyncio
async def test_plugin_style_setting_ids_return_setting_not_found() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        ctx, _frontend_sender = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        plugin_setting_id = "plugin::legacy-plugin::enabled"

        # Plugin-style ids should now be treated as plain unknown settings.
        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is not None
        assert get_result.error.code == "setting_not_found"

        set_result = await set_ui_setting_value(
            settingId=plugin_setting_id,
            value=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is not None
        assert set_result.error.code == "setting_not_found"

        reveal_result = await reveal_ui_setting(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 0
        assert len(reveal_result.statuses) == 1
        assert reveal_result.statuses[0].error is not None
        assert reveal_result.statuses[0].error.code == "setting_not_found"
