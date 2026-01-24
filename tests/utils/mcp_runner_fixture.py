import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace

import anyio
import setta.mcp.tools  # noqa: F401
from fastapi import FastAPI
from mcp.client.session import ClientSession

from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.mcp.server import SettaFastMCP
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.terminals.terminals import Terminals
from setta.types.llm_config import MCPServerConfig
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

from tests.utils.manager_fixture import ProjectManagerFixture, real_project_manager, real_settings_manager


@asynccontextmanager
async def build_runner_with_local_mcp_session(
) -> AsyncIterator[tuple[AgentRunner, MultiMCPClient, ProjectManagerFixture]]:
    logging.getLogger("mcp").setLevel(logging.WARNING)
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = WMHFrontendSender(project_fixture.websocket_manager)
        project_manager_switcher = ProjectManagerSwitcher(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
        )
        terminals = Terminals(frontend_sender, settings_fixture.settings_file)
        state = SimpleNamespace(
            dbe=project_fixture.dbe,
            project_manager_switcher=project_manager_switcher,
            terminals=terminals,
        )
        app = FastAPI()
        mcp_server = SettaFastMCP(
            app,
            state,
            "/mcp-test",
            "Test MCP Server",
            frontend_sender,
            project_fixture.dbe,
        )
        mcp_client = MultiMCPClient(
            {
                SETTA_MCP_SERVER_ID: MCPServerConfig(
                    transport="stdio",
                    command="noop",
                )
            }
        )

        client_send, server_receive = anyio.create_memory_object_stream(0)
        server_send, client_receive = anyio.create_memory_object_stream(0)
        server_task = asyncio.create_task(
            mcp_server._mcp_server.run(
                server_receive,
                server_send,
                mcp_server._mcp_server.create_initialization_options(),
            )
        )
        try:
            async with ClientSession(client_receive, client_send) as session:
                await session.initialize()
                tools_result = await session.list_tools()
                mcp_client._sessions[SETTA_MCP_SERVER_ID] = session
                mcp_client._update_tool_cache_for_server(
                    SETTA_MCP_SERVER_ID,
                    list(tools_result.tools),
                )
                runner = AgentRunner(project_fixture.dbe, mcp_client, frontend_sender)
                yield runner, mcp_client, project_fixture
        finally:
            server_task.cancel()
            await asyncio.gather(server_task, return_exceptions=True)
