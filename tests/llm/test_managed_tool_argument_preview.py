from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.chat_toolkit.managed.tool_argument_preview import (
    ManagedToolArgumentPreviewState,
    build_preview_event,
    scan_partial_json_strings,
)
from setta.llm.chat_toolkit.managed.tool_calls import ManagedToolCallState
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.tool_metadata import ToolArgumentPreviewKind, ToolArgumentPreviewMetadata
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.chat_messages import (
    AssistantChatMessage,
    ToolCall,
    ToolCallFunction,
)
from setta.types.id import ID


class TestManagedToolArgumentPreview:
    def test_builds_preview_event_with_canonical_ids(self) -> None:
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

            tool_name = build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "preview_tool")
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

            buffer = (
                f'{{"sectionId":"{temporary_section_id}","code":"print("}}'
            )
            tool_call_state = ManagedToolCallState(argument_buffers={0: buffer})
            preview_state = ManagedToolArgumentPreviewState()
            metadata = ToolArgumentPreviewMetadata(
                targetIdPathsByType={"section": ["sectionId"]},
                previewValuePath="code",
                previewKind=ToolArgumentPreviewKind.code,
            )
            tokens = scan_partial_json_strings(buffer)

            event = build_preview_event(
                assistant_message=assistant,
                tool_call_state=tool_call_state,
                preview_state=preview_state,
                tool_call_index=0,
                arguments_delta='"print(',
                tokens=tokens,
                dbe=dbe,
                tool_argument_metadata_by_name={tool_name: metadata},
            )

            assert event is not None
            if event is None:
                raise AssertionError("Expected preview event")
            assert event.preview_value_delta == "print("
            assert event.target_ids_by_type["section"] == [canonical_section_id]

            repeat_event = build_preview_event(
                assistant_message=assistant,
                tool_call_state=tool_call_state,
                preview_state=preview_state,
                tool_call_index=0,
                arguments_delta="",
                tokens=tokens,
                dbe=dbe,
                tool_argument_metadata_by_name={tool_name: metadata},
            )
            assert repeat_event is None

    def test_builds_preview_event_without_target_ids(self) -> None:
        with TemporaryDirectory() as temp_dir:
            tool_name = build_namespaced_tool_name(
                SETTA_MCP_SERVER_ID, "preview_tool"
            )
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

            buffer = '{"patches":"{\\"op\\":\\"set\\""}'
            tool_call_state = ManagedToolCallState(argument_buffers={0: buffer})
            preview_state = ManagedToolArgumentPreviewState()
            metadata = ToolArgumentPreviewMetadata(
                targetIdPathsByType={},
                previewValuePath="patches",
                previewKind=ToolArgumentPreviewKind.appSpecPatch,
            )
            tokens = scan_partial_json_strings(buffer)

            event = build_preview_event(
                assistant_message=assistant,
                tool_call_state=tool_call_state,
                preview_state=preview_state,
                tool_call_index=0,
                arguments_delta='"{\\"op\\":\\"set\\""',
                tokens=tokens,
                dbe=DBE(Path(temp_dir)),
                tool_argument_metadata_by_name={tool_name: metadata},
            )

            assert event is not None
            if event is None:
                raise AssertionError("Expected preview event")
            assert event.preview_kind == ToolArgumentPreviewKind.appSpecPatch
            assert event.target_ids_by_type == {}
