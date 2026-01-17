import unittest

from setta.llm.chat_toolkit import ToolCallAccumulator, ToolRunner
from setta.mcp.client import MultiMCPClient


class ToolRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_accumulator_and_runner_with_disabled_mcp(self) -> None:
        tool_name = "server__tool"
        accumulator = ToolCallAccumulator()
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta='{"value": "ok"}',
            tool_name=tool_name,
        )
        tool_calls = accumulator.finalize()

        self.assertEqual(tool_calls[0].function.arguments, {"value": "ok"})

        mcp_client = MultiMCPClient({}, disabled=True)
        mcp_client.routing[tool_name] = ("server", "tool")
        runner = ToolRunner(mcp_client, allowed_server_ids={"server"})

        with self.assertRaises(ValueError):
            await runner.run(tool_calls)
