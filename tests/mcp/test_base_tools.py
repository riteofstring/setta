from types import SimpleNamespace

import pytest
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

@pytest.mark.asyncio
class TestGetProjectConfigNamesAndIds:
    async def test_returns_id_name_dicts(self) -> None:
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
            assert len(metadata) > 0

            expected = [{"id": str(entry.id), "name": entry.name} for entry in metadata]
            assert response.model_dump().get("projectConfigs") == expected


class TestGetInstalledPythonPackages:
    def test_returns_sorted_package_strings(self) -> None:
        response = getInstalledPythonPackages()
        packages = response.packages
        assert isinstance(packages, list)
        assert len(packages) > 0

        sorted_packages = sorted(packages, key=str.lower)
        assert packages == sorted_packages

        for package in packages:
            assert isinstance(package, str)
            assert "=" in package
            name, version = package.split("=", 1)
            assert name.strip()
            assert version.strip()
