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


def _collect_ids_from_arguments(
    annotations_by_name: dict[str, SettaToolAnnotations],
    arguments_list: list[dict[str, object]],
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
        annotations_by_name,
    )


class TestAIFollowIdsByTypeExtraction:
    def test_missing_section_ids_returns_none(self) -> None:
        result = _collect_ids_from_arguments({}, [{"otherKey": "value"}])

        assert result is None

    def test_collects_ids_from_tool_argument_metadata(self) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "annotated_tool")
        annotations_by_name = {
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
            annotations_by_name,
        )

        assert result is not None
        assert {str(value) for value in result["section"]} == {"section-9"}

    def test_collects_section_ids_from_mapping_keys(self) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "mapping_tool")
        annotations_by_name = {
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
            annotations_by_name,
        )

        assert result is not None
        assert {str(value) for value in result["section"]} == {"section-1"}

    def test_ignores_non_setta_tool_arguments(self) -> None:
        tool_name = build_namespaced_tool_name("context7", "annotated_tool")
        annotations_by_name = {
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
            annotations_by_name,
        )

        assert result is None
