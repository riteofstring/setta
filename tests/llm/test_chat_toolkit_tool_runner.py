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

        results = await runner.run(tool_calls)
        self.assertEqual(len(results), 1)
        message = results[0]
        self.assertTrue(message.is_error)
        self.assertEqual(message.tool_name, tool_name)
        self.assertIn("disabled", message.result.get("error", ""))

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

        with self.assertRaises(ValueError):
            await runner.run(tool_calls)
