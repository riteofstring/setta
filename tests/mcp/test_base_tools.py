import unittest
from types import SimpleNamespace

from mcp.server.fastmcp.server import Context
from setta.mcp.tools.base_tools import (
    getInstalledPythonPackages,
    getProjectConfigNamesAndIds,
)
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
                    main_manager=project_fixture.manager,
                    settings_manager=settings_fixture.manager,
                )
                state = SimpleNamespace(
                    project_manager_switcher=switcher,
                    share_mode=False,
                )
                ctx = Context(fastmcp=SimpleNamespace(state=state))

                response = getProjectConfigNamesAndIds(ctx=ctx)
                _, metadata = project_fixture.manager.get_all_project_metadata()
                self.assertGreater(len(metadata), 0)

                expected = [
                    {"id": str(entry.id), "name": entry.name} for entry in metadata
                ]
                self.assertEqual(
                    response.model_dump().get("projectConfigs"),
                    expected,
                )
        except RuntimeError as exc:
            self.skipTest(str(exc))


class GetInstalledPythonPackagesTests(unittest.TestCase):
    def test_returns_sorted_package_strings(self) -> None:
        response = getInstalledPythonPackages()
        packages = response.packages
        self.assertIsInstance(packages, list)
        self.assertGreater(len(packages), 0)

        sorted_packages = sorted(packages, key=str.lower)
        self.assertEqual(packages, sorted_packages)

        for package in packages:
            self.assertIsInstance(package, str)
            self.assertIn("=", package)
            name, version = package.split("=", 1)
            self.assertTrue(name.strip())
            self.assertTrue(version.strip())
