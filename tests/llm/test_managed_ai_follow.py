from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.chat_toolkit.managed.ai_follow import (
    build_streaming_follow_ids,
    collect_ai_follow_ids_by_type_from_tool_calls,
)
from setta.llm.chat_toolkit.managed.tool_calls import ManagedToolCallState
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    SettaToolAnnotations,
    SettaToolType,
)
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.chat_messages import (
    AssistantChatMessage,
    ToolCall,
    ToolCallFunction,
)
from setta.types.id import ID


class TestManagedAIFollow:
    def test_collects_ids_from_tool_calls(self) -> None:
        tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "follow_tool")
        annotations_by_name = {
            tool_name: SettaToolAnnotations(
                settaToolType=SettaToolType.discoverable,
                aiFollowToolArguments=AIFollowToolArgumentsMetadata(
                    pathsByIdType={"section": ["sectionId", "sectionsById"]},
                ),
            )
        }
        tool_call = ToolCall(
            function=ToolCallFunction(
                name=tool_name,
                arguments={
                    "sectionId": "temp-1",
                    "sectionsById": {"temp-2": True},
                },
            )
        )

        result = collect_ai_follow_ids_by_type_from_tool_calls(
            [tool_call],
            annotations_by_name,
        )

        assert result is not None
        if result is None:
            raise AssertionError("Expected ai-follow ids")
        assert {str(value) for value in result["section"]} == {
            "temp-1",
            "temp-2",
        }

    def test_build_streaming_follow_ids_canonicalizes(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
            canonical_section_id = ID("section-1")
            temporary_section_id = convert_canonical_ids_to_temporary(
                canonical_section_id,
                canonical_to_temporary,
                temporary_to_canonical,
            )
            dbe.write_temporary_id_map(canonical_to_temporary)

            tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "follow_tool")
            annotations_by_name = {
                tool_name: SettaToolAnnotations(
                    settaToolType=SettaToolType.discoverable,
                    aiFollowToolArguments=AIFollowToolArgumentsMetadata(
                        pathsByIdType={"section": ["sectionId"]},
                    ),
                )
            }
            assistant = AssistantChatMessage(
                content=[],
                tool_calls=[
                    ToolCall(
                        id="tool-call-1",
                        function=ToolCallFunction(
                            name=tool_name,
                            arguments={},
                        ),
                    )
                ],
            )
            tool_call_state = ManagedToolCallState(
                argument_buffers={
                    0: f'{{"sectionId":"{temporary_section_id}"}}'
                }
            )

            result = build_streaming_follow_ids(
                assistant_message=assistant,
                tool_call_state=tool_call_state,
                tokens_by_index=None,
                dbe=dbe,
                annotations_by_name=annotations_by_name,
            )

            assert result == {"section": [canonical_section_id]}
