from types import SimpleNamespace

import pytest
from mcp.server.fastmcp.server import Context
from setta.mcp.client import MultiMCPClient
from setta.mcp.tools.base_tools import (
    getInstalledPythonPackages,
    get_mcp_server_runtime_status,
    getProjectConfigNamesAndIds,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.types.llm_config import MCPServerConfig

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


class TestGetMCPServerRuntimeStatus:
    def test_returns_statuses_from_multi_mcp_client_without_crashing(self) -> None:
        client = MultiMCPClient(
            {
                "setta": MCPServerConfig(
                    transport="sse",
                    url="http://127.0.0.1:8000/mcp",
                ),
                "filesystem": MCPServerConfig(
                    transport="stdio",
                    command="npx",
                    args=["@modelcontextprotocol/server-filesystem"],
                ),
            }
        )
        state = SimpleNamespace(mcp_client=client)
        ctx = Context(fastmcp=SimpleNamespace(state=state))

        response = get_mcp_server_runtime_status(ctx=ctx)
        payload = response.model_dump()
        servers = payload.get("servers")
        assert isinstance(servers, list)
        if not isinstance(servers, list):
            raise AssertionError("Expected servers list in runtime status response.")
        assert len(servers) == 2
        setta_status = next(
            (entry for entry in servers if entry["serverId"] == "setta"), None
        )
        assert setta_status is not None
        assert setta_status["toolCount"] == 0
        assert setta_status["lastError"] is None
        assert setta_status["missingEnvVar"] is None
