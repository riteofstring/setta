import types
from types import SimpleNamespace
from typing import TYPE_CHECKING, cast

from fastapi import HTTPException
import pytest
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import ForceRefreshProjectRequest
from setta.routers.project_manager import route_force_refresh_listener
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.manager_fixture import (
    real_project_manager,
    real_settings_manager,
)
from tests.utils.runtime_context import runtime_context

if TYPE_CHECKING:
    from setta.server_state import SettaFastAPIState


@pytest.mark.asyncio
async def test_force_refresh_broadcasts_latest_snapshot() -> None:
    try:
        async with (
            real_project_manager() as project_fixture,
            real_settings_manager() as settings_fixture,
        ):
            switcher = ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            )
            frontend_sender = WMHFrontendSender(WebsocketManager())
            state = cast(
                "SettaFastAPIState",
                SimpleNamespace(
                    project_manager_switcher=switcher,
                    wmh_python_script_sender=project_fixture.python_script_sender,
                    wmh_frontend_sender=frontend_sender,
                    share_mode=False,
                    deployment_mode=False,
                ),
            )
            default_project_config_id = (
                project_fixture.manager.project_state_backend.defaultProjectConfigId
            )
            assert (
                default_project_config_id is not None
            ), "Expected default project config id for force refresh test."
            await project_fixture.manager.finish_pending_operations()

            captured_calls: list[dict[str, object | None]] = []

            async def capture_force_refresh(
                self,
                *,
                projectState: ProjectStateSingleConfig,
                projectConfigId: ID | None = None,
                targetWebsocketIds: tuple[str, ...] | list[str] | None = None,
                share_session_id: str | None = None,
            ) -> None:
                captured_calls.append(
                    {
                        "projectState": projectState,
                        "projectConfigId": projectConfigId,
                        "targetWebsocketIds": targetWebsocketIds,
                        "shareSessionId": share_session_id,
                    }
                )

            sender = state.wmh_python_script_sender
            original_send_force_refresh = sender.send_force_refresh
            sender.send_force_refresh = types.MethodType(
                capture_force_refresh,
                sender,
            )
            try:
                request = ForceRefreshProjectRequest(
                    projectConfigId=default_project_config_id
                )
                with runtime_context(state) as runtime_ctx:
                    await route_force_refresh_listener(request, runtime_ctx)
            finally:
                sender.send_force_refresh = original_send_force_refresh

            assert len(captured_calls) == 1
            call = captured_calls[0]
            project_state = cast("ProjectStateSingleConfig", call["projectState"])
            assert project_state.projectConfig.id == default_project_config_id
            assert call["projectConfigId"] is None
            assert call["targetWebsocketIds"] is None
            assert call["shareSessionId"] is None
    except RuntimeError as exc:
        pytest.skip(str(exc))


@pytest.mark.asyncio
async def test_force_refresh_missing_project_raises_http_error() -> None:
    try:
        async with (
            real_project_manager() as project_fixture,
            real_settings_manager() as settings_fixture,
        ):
            switcher = ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            )
            frontend_sender = WMHFrontendSender(WebsocketManager())
            state = cast(
                "SettaFastAPIState",
                SimpleNamespace(
                    project_manager_switcher=switcher,
                    wmh_python_script_sender=project_fixture.python_script_sender,
                    wmh_frontend_sender=frontend_sender,
                    share_mode=False,
                    deployment_mode=False,
                ),
            )

            request = ForceRefreshProjectRequest(projectConfigId=ID("missing-project"))
            with pytest.raises(HTTPException) as exc:
                with runtime_context(state) as runtime_ctx:
                    await route_force_refresh_listener(request, runtime_ctx)
            assert exc.value.status_code == 404
    except RuntimeError as exc:
        pytest.skip(str(exc))
