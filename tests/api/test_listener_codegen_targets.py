import unittest

from setta.api.listener import SettaListener
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig


class SettaListenerCodegenTargetTests(unittest.IsolatedAsyncioTestCase):
    async def test_listener_fails_fast_without_python_codegen(self) -> None:
        project_config = ProjectConfig(
            id=ID("project-disabled"),
            name="Project Disabled",
            codegenTargets=[],
        )
        project_state = ProjectStateSingleConfig(projectConfig=project_config)
        listener = SettaListener(project_name=project_config.name)

        with self.assertRaises(RuntimeError):
            await listener._refresh_from_snapshot(project_state)

        self.assertTrue(listener._stop_event.is_set())
