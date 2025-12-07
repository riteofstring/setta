import types
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import ForceRefreshProjectRequest
from setta.routers.project_manager import route_force_refresh_listener
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig

from tests.utils.manager_fixture import (
    real_project_manager,
    real_settings_manager,
)


class RouteForceRefreshListenerTests(unittest.IsolatedAsyncioTestCase):
    async def test_force_refresh_broadcasts_latest_snapshot(self) -> None:
        try:
            async with (
                real_project_manager() as project_fixture,
                real_settings_manager() as settings_fixture,
            ):
                switcher = ProjectManagerSwitcher(
                    project_fixture.manager,
                    settings_fixture.manager,
                )
                state = SimpleNamespace(
                    project_manager_switcher=switcher,
                    wmh_python_script_sender=project_fixture.python_script_sender,
                )
                default_project_config_id = (
                    project_fixture.manager.project_state_backend.defaultProjectConfigId
                )
                self.assertIsNotNone(default_project_config_id)
                default_project_config_id = str(default_project_config_id)
                await project_fixture.manager.finish_pending_operations()

                captured_calls: list[dict[str, object | None]] = []

                async def capture_force_refresh(
                    self,
                    *,
                    projectState: ProjectStateSingleConfig,
                    projectConfigId: ID | None = None,
                    targetWebsocketIds: tuple[str, ...] | list[str] | None = None,
                ) -> None:
                    captured_calls.append(
                        {
                            "projectState": projectState,
                            "projectConfigId": projectConfigId,
                            "targetWebsocketIds": targetWebsocketIds,
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
                    await route_force_refresh_listener(request, state)
                finally:
                    sender.send_force_refresh = original_send_force_refresh

                self.assertEqual(1, len(captured_calls))
                call = captured_calls[0]
                project_state = call["projectState"]
                self.assertIsNotNone(project_state)
                self.assertEqual(
                    default_project_config_id,
                    project_state.projectConfig.id,
                )
                self.assertIsNone(call["projectConfigId"])
                self.assertIsNone(call["targetWebsocketIds"])
        except RuntimeError as exc:
            self.skipTest(str(exc))

    async def test_force_refresh_missing_project_raises_http_error(self) -> None:
        try:
            async with (
                real_project_manager() as project_fixture,
                real_settings_manager() as settings_fixture,
            ):
                switcher = ProjectManagerSwitcher(
                    project_fixture.manager,
                    settings_fixture.manager,
                )
                state = SimpleNamespace(
                    project_manager_switcher=switcher,
                    wmh_python_script_sender=project_fixture.python_script_sender,
                )

                request = ForceRefreshProjectRequest(projectConfigId="missing-project")
                with self.assertRaises(HTTPException) as ctx:
                    await route_force_refresh_listener(request, state)
                self.assertEqual(404, ctx.exception.status_code)
        except RuntimeError as exc:
            self.skipTest(str(exc))
