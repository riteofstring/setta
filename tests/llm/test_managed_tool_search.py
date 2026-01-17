import unittest

from setta.llm.chat_toolkit.managed.tool_search import (
    build_search_tool_chat_message,
    parse_search_tool_results,
    run_local_search_tool,
)
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.types.chat_messages import ToolCall, ToolCallFunction, ToolReferenceContent
from setta.types.id import ID
from setta.utils.constants import C


class ManagedToolSearchTests(unittest.TestCase):
    def test_search_tool_emits_tool_references(self) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "alpha_tool")
        available_tools = {
            tool_name: {
                "type": "function",
                "function": {
                    "name": tool_name,
                    "description": "alpha search tool",
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        }
        call_result = run_local_search_tool(
            arguments={"query": "alpha", "limit": 1},
            available_tools=available_tools,
            annotations_by_name={},
        )
        results = parse_search_tool_results(call_result)
        self.assertEqual(results[0]["name"], tool_name)

        search_tool_name = build_namespaced_tool_name(
            SETTA_MCP_SERVER_ID,
            C.SEARCH_MCP_TOOLS_NAME,
        )
        tool_call = ToolCall(
            id="tool-call-1",
            function=ToolCallFunction(
                name=search_tool_name,
                arguments={"query": "alpha", "limit": 1},
            ),
        )

        tool_message, referenced_names = build_search_tool_chat_message(
            chat_id=ID("chat-1"),
            tool_name=search_tool_name,
            tool_call=tool_call,
            call_result=call_result,
            arguments={"query": "alpha", "limit": 1},
            started_at=0,
            completed_at=0,
            available_tools=available_tools,
        )

        self.assertIn(tool_name, referenced_names)
        reference_blocks = [
            entry.tool_name
            for entry in tool_message.content
            if isinstance(entry, ToolReferenceContent)
        ]
        self.assertIn(tool_name, reference_blocks)


if __name__ == "__main__":
    unittest.main()
