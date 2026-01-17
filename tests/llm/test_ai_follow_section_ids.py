import unittest

from setta.llm.chat_toolkit.managed.ai_follow import (
    collect_ai_follow_ids_by_type_from_tool_calls,
)
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    SettaToolAnnotations,
    SettaToolType,
)
from setta.types.id import ID
from setta.types.chat_messages import ToolCall, ToolCallFunction


class AIFollowIdsByTypeExtractionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.annotations_by_name: dict[str, SettaToolAnnotations] = {}

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
        return collect_ai_follow_ids_by_type_from_tool_calls(
            tool_calls,
            self.annotations_by_name,
        )

    def test_missing_section_ids_returns_none(self) -> None:
        result = self._collect_ids_from_arguments(
            [{"otherKey": "value"}]
        )

        self.assertIsNone(result)

    def test_collects_ids_from_tool_argument_metadata(self) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "annotated_tool")
        self.annotations_by_name = {
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

        result = collect_ai_follow_ids_by_type_from_tool_calls(
            [tool_call],
            self.annotations_by_name,
        )

        self.assertIsNotNone(result)
        self.assertEqual(
            {str(value) for value in result["section"]},
            {"section-9"},
        )

    def test_collects_section_ids_from_mapping_keys(self) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "mapping_tool")
        self.annotations_by_name = {
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

        result = collect_ai_follow_ids_by_type_from_tool_calls(
            [tool_call],
            self.annotations_by_name,
        )

        self.assertIsNotNone(result)
        self.assertEqual(
            {str(value) for value in result["section"]},
            {"section-1"},
        )

    def test_ignores_non_setta_tool_arguments(self) -> None:
        tool_name = build_namespaced_tool_name("context7", "annotated_tool")
        self.annotations_by_name = {
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

        result = collect_ai_follow_ids_by_type_from_tool_calls(
            [tool_call],
            self.annotations_by_name,
        )

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
