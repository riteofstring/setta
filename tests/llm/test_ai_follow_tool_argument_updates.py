import unittest

from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    SettaToolAnnotations,
    SettaToolType,
    get_ai_follow_tool_arguments,
)
from setta.mcp.tool_setup import SETTA_INIT_MCP_TOOLS, SETTA_MCP_TOOLS
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.types.chat_messages import ToolCall, ToolCallFunction
from setta.types.id import ID
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

from tests.utils.manager_fixture import real_project_manager


def _build_tool_annotations_by_name(
    server_id: str,
) -> dict[str, SettaToolAnnotations]:
    tool_annotations_by_name: dict[str, SettaToolAnnotations] = {}
    for tool_fn in SETTA_INIT_MCP_TOOLS:
        tool_annotations_by_name[
            build_namespaced_tool_name(server_id, tool_fn.__name__)
        ] = SettaToolAnnotations(
            settaToolType=SettaToolType.init,
            aiFollowToolArguments=get_ai_follow_tool_arguments(tool_fn),
        )
    for tool_fn in SETTA_MCP_TOOLS:
        tool_annotations_by_name[
            build_namespaced_tool_name(server_id, tool_fn.__name__)
        ] = SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            aiFollowToolArguments=get_ai_follow_tool_arguments(tool_fn),
        )
    return tool_annotations_by_name


def _build_ids_by_type(
    fixture,
    id_types: set[str],
) -> dict[str, ID]:
    canonical_ids_by_type: dict[str, ID] = {}
    for id_type in id_types:
        if id_type == "section":
            sections = fixture.manager.project_state_backend.sections
            if not sections:
                raise AssertionError("No section IDs available for aiFollowToolArguments")
            canonical_ids_by_type[id_type] = next(iter(sections))
        elif id_type == "codeObj":
            code_objs = fixture.manager.project_state_backend.codeObjs
            if not code_objs:
                raise AssertionError("No codeObj IDs available for aiFollowToolArguments")
            canonical_ids_by_type[id_type] = next(iter(code_objs))
        else:
            raise AssertionError(
                f"Unexpected aiFollowToolArguments id type: {id_type}"
            )

    temporary_to_canonical, canonical_to_temporary = fixture.dbe.read_temporary_id_map()
    temporary_ids_by_type: dict[str, ID] = {}
    for id_type, canonical_id in canonical_ids_by_type.items():
        temporary_ids_by_type[id_type] = convert_canonical_ids_to_temporary(
            canonical_id,
            canonical_to_temporary,
            temporary_to_canonical,
        )
    fixture.dbe.write_temporary_id_map(canonical_to_temporary)
    return temporary_ids_by_type


def _set_payload_value(payload: dict[str, object], path: str, value: object) -> None:
    segments = [segment for segment in path.split(".") if segment]
    if not segments:
        return
    current: dict[str, object] = payload
    for segment in segments[:-1]:
        next_value = current.get(segment)
        if not isinstance(next_value, dict):
            next_value = {}
            current[segment] = next_value
        current = next_value
    current[segments[-1]] = value


def _build_argument_value(path: str, id_value: str) -> object:
    if path == "sectionSizes":
        return {id_value: {"width": 320, "height": 240}}
    if path in {"sectionIds", "topLevelSections"}:
        return [id_value]
    return id_value


def _build_arguments_for_metadata(
    metadata: AIFollowToolArgumentsMetadata,
    temporary_ids_by_type: dict[str, ID],
) -> dict[str, object]:
    payload: dict[str, object] = {}
    for id_type, paths in metadata.pathsByIdType.items():
        if id_type not in temporary_ids_by_type:
            raise AssertionError(
                f"Missing temporary id for aiFollowToolArguments type {id_type}"
            )
        id_value = str(temporary_ids_by_type[id_type])
        for path in paths:
            if path == "$":
                raise AssertionError(
                    "Unexpected root path for aiFollowToolArguments metadata"
                )
            value = _build_argument_value(path, id_value)
            _set_payload_value(payload, path, value)
    return payload


class AIFollowToolArgumentExtractionTests(unittest.IsolatedAsyncioTestCase):
    async def test_ai_follow_tool_argument_extraction_for_registered_tools(self) -> None:
        async with real_project_manager() as fixture:
            frontend_sender = WMHFrontendSender(fixture.websocket_manager)
            mcp_client = MultiMCPClient({})
            project_manager_switcher = ProjectManagerSwitcher(
                fixture.manager,
                fixture.manager,
            )
            chat_manager = LLMChatManager(
                fixture.dbe,
                mcp_client,
                frontend_sender,
                project_manager_switcher,
            )

            tool_annotations_by_name = _build_tool_annotations_by_name(
                SETTA_MCP_SERVER_ID
            )
            self.assertTrue(tool_annotations_by_name)
            mcp_client.tool_annotations_by_name = tool_annotations_by_name

            id_types: set[str] = set()
            for annotations in tool_annotations_by_name.values():
                if annotations.aiFollowToolArguments:
                    id_types.update(
                        annotations.aiFollowToolArguments.pathsByIdType.keys()
                    )

            temporary_ids_by_type = _build_ids_by_type(fixture, id_types)

            for tool_name, annotations in tool_annotations_by_name.items():
                metadata = annotations.aiFollowToolArguments
                if metadata is None:
                    tool_call = ToolCall(
                        function=ToolCallFunction(name=tool_name, arguments={})
                    )
                    result = (
                        chat_manager._collect_ai_follow_ids_by_type_from_tool_calls(
                            [tool_call]
                        )
                    )
                    self.assertIsNone(result, tool_name)
                    continue

                arguments = _build_arguments_for_metadata(
                    metadata,
                    temporary_ids_by_type,
                )
                tool_call = ToolCall(
                    function=ToolCallFunction(name=tool_name, arguments=arguments)
                )
                result = chat_manager._collect_ai_follow_ids_by_type_from_tool_calls(
                    [tool_call]
                )
                self.assertIsInstance(result, dict, tool_name)
                for id_type in metadata.pathsByIdType:
                    expected_id = temporary_ids_by_type[id_type]
                    self.assertIn(expected_id, result.get(id_type, []), tool_name)


if __name__ == "__main__":
    unittest.main()
