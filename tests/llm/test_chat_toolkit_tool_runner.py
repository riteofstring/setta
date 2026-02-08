import pytest

from setta.llm.chat_toolkit import ToolCallAccumulator, ToolRunner
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name


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
