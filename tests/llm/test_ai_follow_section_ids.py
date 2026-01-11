import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    SettaToolAnnotations,
    SettaToolType,
)
from setta.types.id import ID
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from setta.types.chat_messages import ToolCall, ToolCallFunction

class AIFollowIdsByTypeExtractionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.dbe = DBE(Path(self.temp_dir.name))
        self.websocket_manager = WebsocketManager()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.mcp_client = MultiMCPClient({})
        self.manager = LLMChatManager(
            self.dbe,
            self.mcp_client,
            self.frontend_sender,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _collect_ids_from_arguments(
        self, arguments_list: list[dict[str, object]]
    ) -> dict[str, list[ID]] | None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "test_tool")
        tool_calls = [
            ToolCall(
                function=ToolCallFunction(
                    name=tool_name,
                    arguments=arguments,
                )
            )
            for arguments in arguments_list
        ]
        return self.manager._collect_ai_follow_ids_by_type_from_tool_calls(tool_calls)

    def test_missing_section_ids_returns_none(self) -> None:
        result = self._collect_ids_from_arguments(
            [{"otherKey": "value"}]
        )

        self.assertIsNone(result)

    def test_collects_ids_from_tool_argument_metadata(self) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "annotated_tool")
        self.manager.mcp_client.tool_annotations_by_name = {
            tool_name: SettaToolAnnotations(
                settaToolType=SettaToolType.discoverable,
                aiFollowToolArguments=AIFollowToolArgumentsMetadata(
                    pathsByIdType={"section": ["targetSectionId"]},
                ),
            )
        }
        tool_call = ToolCall(
            function=ToolCallFunction(
                name=tool_name,
                arguments={"targetSectionId": "section-9"},
            )
        )

        result = self.manager._collect_ai_follow_ids_by_type_from_tool_calls(
            [tool_call]
        )

        self.assertIsNotNone(result)
        self.assertEqual(
            {str(value) for value in result["section"]},
            {"section-9"},
        )

    def test_collects_section_ids_from_mapping_keys(self) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "mapping_tool")
        self.manager.mcp_client.tool_annotations_by_name = {
            tool_name: SettaToolAnnotations(
                settaToolType=SettaToolType.discoverable,
                aiFollowToolArguments=AIFollowToolArgumentsMetadata(
                    pathsByIdType={"section": ["sectionSizes"]},
                ),
            )
        }
        tool_call = ToolCall(
            function=ToolCallFunction(
                name=tool_name,
                arguments={"sectionSizes": {"section-1": {"width": 320}}},
            )
        )

        result = self.manager._collect_ai_follow_ids_by_type_from_tool_calls(
            [tool_call]
        )

        self.assertIsNotNone(result)
        self.assertEqual(
            {str(value) for value in result["section"]},
            {"section-1"},
        )

    def test_ignores_non_setta_tool_arguments(self) -> None:
        tool_name = build_namespaced_tool_name("context7", "annotated_tool")
        self.manager.mcp_client.tool_annotations_by_name = {
            tool_name: SettaToolAnnotations(
                settaToolType=SettaToolType.discoverable,
                aiFollowToolArguments=AIFollowToolArgumentsMetadata(
                    pathsByIdType={"section": ["targetSectionId"]},
                ),
            )
        }
        tool_call = ToolCall(
            function=ToolCallFunction(
                name=tool_name,
                arguments={"targetSectionId": "section-9"},
            )
        )

        result = self.manager._collect_ai_follow_ids_by_type_from_tool_calls(
            [tool_call]
        )

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
