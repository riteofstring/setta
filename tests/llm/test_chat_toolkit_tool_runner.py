import pytest
from mcp.types import CallToolResult, TextContent

from setta.llm.chat_toolkit import ToolCallAccumulator, ToolRunner
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.types.id import ID


class TestToolRunner:
    pytestmark = pytest.mark.asyncio

    async def test_accumulator_and_runner_with_disabled_mcp(self) -> None:
        tool_name = "server__tool"
        accumulator = ToolCallAccumulator()
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta='{"value": "ok"}',
            tool_name=tool_name,
        )
        tool_calls = accumulator.finalize()

        assert tool_calls[0].function.arguments == {"value": "ok"}

        mcp_client = MultiMCPClient({}, disabled=True)
        mcp_client.routing[tool_name] = ("server", "tool")
        runner = ToolRunner(mcp_client, allowed_server_ids={"server"})

        results = await runner.run(tool_calls)
        assert len(results) == 1
        message = results[0]
        assert message.is_error
        assert message.tool_name == tool_name
        assert "disabled" in message.result.get("error", "")

    async def test_runner_strict_mode_raises(self) -> None:
        tool_name = "server__tool"
        accumulator = ToolCallAccumulator()
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta='{"value": "ok"}',
            tool_name=tool_name,
        )
        tool_calls = accumulator.finalize()

        mcp_client = MultiMCPClient({}, disabled=True)
        mcp_client.routing[tool_name] = ("server", "tool")
        runner = ToolRunner(mcp_client, allowed_server_ids={"server"}, strict=True)

        with pytest.raises(ValueError):
            await runner.run(tool_calls)

    async def test_runner_requires_project_config_id_meta_for_setta_tools(self) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "alpha_tool")
        accumulator = ToolCallAccumulator()
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta="{}",
            tool_name=tool_name,
        )
        tool_calls = accumulator.finalize()

        mcp_client = MultiMCPClient({}, disabled=True)
        mcp_client.routing[tool_name] = (SETTA_MCP_SERVER_ID, "alpha_tool")
        runner = ToolRunner(
            mcp_client,
            allowed_server_ids={SETTA_MCP_SERVER_ID},
            strict=True,
        )

        with pytest.raises(ValueError):
            await runner.run(tool_calls)

    async def test_runner_propagates_frontend_affinity_token_meta_for_setta_tools(
        self,
    ) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "alpha_tool")
        accumulator = ToolCallAccumulator()
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta="{}",
            tool_name=tool_name,
        )
        tool_calls = accumulator.finalize()

        mcp_client = MultiMCPClient({})
        mcp_client.routing[tool_name] = (SETTA_MCP_SERVER_ID, "alpha_tool")
        captured_meta: list[dict[str, str | None] | None] = []

        async def _fake_call_tool(
            name: str,
            arguments: dict[str, object],
            meta: dict[str, str | None] | None = None,
        ) -> CallToolResult:
            assert name == tool_name
            assert arguments == {}
            captured_meta.append(meta)
            return CallToolResult(
                content=[TextContent(type="text", text="ok")],
                structuredContent={"ok": True},
                isError=False,
            )

        setattr(mcp_client, "call_tool", _fake_call_tool)
        runner = ToolRunner(
            mcp_client,
            allowed_server_ids={SETTA_MCP_SERVER_ID},
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=ID("section-1"),
            frontend_affinity_token="frontend-1",
            strict=True,
        )

        results = await runner.run(tool_calls)

        assert len(results) == 1
        assert not results[0].is_error
        assert captured_meta == [
            {
                "projectConfigId": "project-1",
                "chatId": "chat-1",
                "sectionId": "section-1",
                "frontendAffinityToken": "frontend-1",
            }
        ]

    async def test_runner_preserves_frontend_affinity_token_meta_for_share_scoped_setta_tools(
        self,
    ) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "alpha_tool")
        accumulator = ToolCallAccumulator()
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta="{}",
            tool_name=tool_name,
        )
        tool_calls = accumulator.finalize()

        mcp_client = MultiMCPClient({})
        mcp_client.routing[tool_name] = (SETTA_MCP_SERVER_ID, "alpha_tool")
        captured_meta: list[dict[str, str | None] | None] = []

        async def _fake_call_tool(
            name: str,
            arguments: dict[str, object],
            meta: dict[str, str | None] | None = None,
        ) -> CallToolResult:
            assert name == tool_name
            assert arguments == {}
            captured_meta.append(meta)
            return CallToolResult(
                content=[TextContent(type="text", text="ok")],
                structuredContent={"ok": True},
                isError=False,
            )

        setattr(mcp_client, "call_tool", _fake_call_tool)
        runner = ToolRunner(
            mcp_client,
            allowed_server_ids={SETTA_MCP_SERVER_ID},
            share_session_id="share-session-1",
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=ID("section-1"),
            frontend_affinity_token="frontend-1",
            strict=True,
        )

        results = await runner.run(tool_calls)

        assert len(results) == 1
        assert not results[0].is_error
        assert captured_meta == [
            {
                "shareSessionId": "share-session-1",
                "projectConfigId": "project-1",
                "chatId": "chat-1",
                "sectionId": "section-1",
                "frontendAffinityToken": "frontend-1",
            }
        ]
