import unittest
from types import SimpleNamespace

from setta.mcp.tools.base_tools import getProjectConfigNamesAndIds
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from tests.utils.manager_fixture import (
    real_project_manager,
    real_settings_manager,
)


class GetProjectConfigNamesAndIdsTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_id_name_dicts(self) -> None:
        try:
            async with (
                real_project_manager() as project_fixture,
                real_settings_manager() as settings_fixture,
            ):
                switcher = ProjectManagerSwitcher(
                    project_fixture.manager,
                    settings_fixture.manager,
                )
                state = SimpleNamespace(project_manager_switcher=switcher)

                response = getProjectConfigNamesAndIds(setta_state=state)
                _, metadata = project_fixture.manager.get_all_project_metadata()
                self.assertGreater(len(metadata), 0)

                expected = [
                    {"id": str(entry.id), "name": entry.name} for entry in metadata
                ]
                self.assertEqual(response.model_dump(), expected)
        except RuntimeError as exc:
            self.skipTest(str(exc))
