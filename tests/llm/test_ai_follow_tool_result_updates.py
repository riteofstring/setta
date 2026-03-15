import json
import logging

from mcp.types import CallToolResult, TextContent
import pytest
from setta.llm.chat_store import AgentRunChatStore
from setta.llm.chat_toolkit.history import ChatHistory
from setta.llm.chat_toolkit.managed.action_executor import ManagedActionExecutor
from setta.llm.chat_toolkit.managed.actions import UpdateAIFollowResultAction
from setta.llm.chat_toolkit.managed.ai_follow import build_tool_result_follow_ids
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.mcp.tool_metadata import (
    AIFollowToolResultMetadata,
    SettaToolAnnotations,
    SettaToolType,
)
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.project_state.project_manager_types import (
    AddKwargRequest,
    CreateTopLevelSectionRequest,
)
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.section_impls import SectionType
from setta.types.websocket import (
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
)
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from tests.utils.manager_fixture import real_project_manager


def _build_tool_annotations_by_name(
    server_id: str,
) -> dict[str, SettaToolAnnotations]:
    return {
        build_namespaced_tool_name(
            server_id,
            "create_top_level_section",
        ): SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            aiFollowToolResult=AIFollowToolResultMetadata(
                pathsByIdType={"section": ["sectionId"]},
            ),
        ),
        build_namespaced_tool_name(
            server_id,
            "get_latest_project_state_summary",
        ): SettaToolAnnotations(
            settaToolType=SettaToolType.init,
        ),
        build_namespaced_tool_name(
            server_id,
            "update_param_impl_config",
        ): SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            aiFollowToolResult=AIFollowToolResultMetadata(
                pathsByIdType={
                    "section": ["payload.sectionId"],
                    "codeObj": ["codeObjId"],
                },
            ),
        ),
        build_namespaced_tool_name(
            server_id,
            "resolve_root_section",
        ): SettaToolAnnotations(
            settaToolType=SettaToolType.discoverable,
            aiFollowToolResult=AIFollowToolResultMetadata(
                pathsByIdType={"section": ["$"]},
            ),
        ),
    }


def _build_ids_by_type(
    fixture,
    id_types: set[str],
) -> tuple[dict[str, ID], dict[str, ID]]:
    canonical_ids_by_type: dict[str, ID] = {}
    for id_type in id_types:
        if id_type == "section":
            sections = fixture.manager.project_state_backend.sections
            if not sections:
                raise AssertionError("No section IDs available for aiFollowToolResult")
            canonical_ids_by_type[id_type] = next(iter(sections))
        elif id_type == "codeObj":
            code_objs = fixture.manager.project_state_backend.codeObjs
            if not code_objs:
                raise AssertionError("No codeObj IDs available for aiFollowToolResult")
            canonical_ids_by_type[id_type] = next(iter(code_objs))
        else:
            raise AssertionError(f"Unexpected aiFollowToolResult id type: {id_type}")

    temporary_to_canonical, canonical_to_temporary = fixture.dbe.read_temporary_id_map()
    temporary_ids_by_type: dict[str, ID] = {}
    for id_type, canonical_id in canonical_ids_by_type.items():
        temporary_ids_by_type[id_type] = convert_canonical_ids_to_temporary(
            canonical_id,
            canonical_to_temporary,
            temporary_to_canonical,
        )
    fixture.dbe.write_temporary_id_map(canonical_to_temporary)
    return canonical_ids_by_type, temporary_ids_by_type


def _set_payload_value(payload: dict[str, object], path: str, value: str) -> None:
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


def _build_call_result_for_metadata(
    metadata: AIFollowToolResultMetadata,
    temporary_ids_by_type: dict[str, ID],
) -> CallToolResult:
    all_paths = [path for paths in metadata.pathsByIdType.values() for path in paths]
    if all_paths and all(path == "$" for path in all_paths):
        root_id_types = [
            id_type
            for id_type, paths in metadata.pathsByIdType.items()
            if "$" in paths
        ]
        if len(root_id_types) != 1:
            raise AssertionError(
                "Expected exactly one aiFollowToolResult root id type"
            )
        root_id_type = root_id_types[0]
        text_payload = str(temporary_ids_by_type[root_id_type])
    else:
        payload: dict[str, object] = {}
        for id_type, paths in metadata.pathsByIdType.items():
            if id_type not in temporary_ids_by_type:
                raise AssertionError(
                    f"Missing temporary id for aiFollowToolResult type {id_type}"
                )
            for path in paths:
                if path == "$":
                    continue
                _set_payload_value(payload, path, str(temporary_ids_by_type[id_type]))
        text_payload = json.dumps(payload)
    return CallToolResult(
        content=[TextContent(type="text", text=text_payload)],
        isError=False,
    )


class TestAIFollowToolResultUpdates:
    pytestmark = pytest.mark.asyncio

    async def test_create_top_level_section_triggers_follow_update(self) -> None:
        async with real_project_manager() as fixture:
            websocket_manager = fixture.websocket_manager
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MultiMCPClient({})
            history = ChatHistory(AgentRunChatStore(fixture.dbe))
            executor = ManagedActionExecutor(
                chat_history=history,
                websocket_msg_handler=frontend_sender,
                mcp_client=mcp_client,
                dbe=fixture.dbe,
                search_tool_name=build_namespaced_tool_name(
                    SETTA_MCP_SERVER_ID, C.SEARCH_MCP_TOOLS_NAME
                ),
                logger=logging.getLogger(__name__),
            )

            websocket_id = "tool-result-follow-socket"
            sent_messages: list[Message] = []
            receive_counter = 0

            async def _receive() -> Message:
                nonlocal receive_counter
                if receive_counter == 0:
                    receive_counter += 1
                    return {"type": "websocket.connect"}
                return {"type": "websocket.receive"}

            async def _send(message: Message) -> None:
                sent_messages.append(message)

            scope: Scope = {
                "type": "websocket",
                "asgi": {"version": "3.0"},
                "scheme": "ws",
                "path": "/",
                "raw_path": b"/",
                "query_string": b"",
                "headers": [],
                "client": ("testclient", 0),
                "server": ("testserver", 80),
                "subprotocols": [],
            }
            websocket = WebSocket(scope=scope, receive=_receive, send=_send)
            await websocket.accept()
            websocket_manager.sockets[websocket_id] = WebsocketConnectionInfoWithSocket(
                id=websocket_id,
                connectionType=WebsocketConnectionType.FRONTEND,
                currentAddress=None,
                websocket=websocket,
            )

            try:
                project_config_id = ID(
                    fixture.manager.project_state_backend.defaultProjectConfigId
                )
                request = CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Dict,
                    position=Position(),
                )
                response = await fixture.manager.create_top_level_section(request)
                section_id = response.sectionId

                temporary_to_canonical, canonical_to_temporary = (
                    fixture.dbe.read_temporary_id_map()
                )
                temporary_response = convert_canonical_ids_to_temporary(
                    response,
                    canonical_to_temporary,
                    temporary_to_canonical,
                )
                fixture.dbe.write_temporary_id_map(canonical_to_temporary)

                call_result = CallToolResult(
                    content=[
                        TextContent(
                            type="text",
                            text=temporary_response.model_dump_json(),
                        )
                    ],
                    isError=False,
                )

                namespaced_tool_name = build_namespaced_tool_name(
                    SETTA_MCP_SERVER_ID,
                    "create_top_level_section",
                )
                mcp_client.tool_annotations_by_name[
                    namespaced_tool_name
                ] = SettaToolAnnotations(
                    settaToolType=SettaToolType.discoverable,
                    aiFollowToolResult=AIFollowToolResultMetadata(
                        pathsByIdType={"section": ["sectionId"]},
                    ),
                )

                chat_id = ID("chat-1")
                follow_ids = build_tool_result_follow_ids(
                    tool_name=namespaced_tool_name,
                    call_result=call_result,
                    dbe=fixture.dbe,
                    annotations_by_name=mcp_client.tool_annotations_by_name,
                )
                if follow_ids is None:
                    raise AssertionError("Expected ai-follow result ids")
                await executor.apply(
                    UpdateAIFollowResultAction(
                        project_config_id=project_config_id,
                        chat_id=chat_id,
                        ids_by_type=follow_ids,
                    )
                )

                follow_updates = [
                    json.loads(message["text"])
                    for message in sent_messages
                    if message.get("type") == "websocket.send"
                    and "text" in message
                    and json.loads(message["text"]).get("messageType")
                    == "AIFollowToolResultUpdate"
                ]

                assert len(follow_updates) == 1
                payload = follow_updates[0]["content"]
                assert payload["projectConfigId"] == str(project_config_id)
                assert payload["chatId"] == str(chat_id)
                assert str(section_id) in payload["idsByType"]["section"]
            finally:
                websocket_manager.sockets.pop(websocket_id, None)
                await websocket.close()

    async def test_ai_follow_tool_result_update_for_explicit_tool_annotations(
        self,
    ) -> None:
        async with real_project_manager() as fixture:
            tool_annotations_by_name = _build_tool_annotations_by_name(
                SETTA_MCP_SERVER_ID
            )
            assert tool_annotations_by_name

            id_types: set[str] = set()
            for annotations in tool_annotations_by_name.values():
                if annotations.aiFollowToolResult:
                    id_types.update(annotations.aiFollowToolResult.pathsByIdType.keys())

            project_config_id = ID(
                fixture.manager.project_state_backend.defaultProjectConfigId
            )
            section_id: ID | None = None
            if "section" in id_types or "codeObj" in id_types:
                sections = fixture.manager.project_state_backend.sections
                if not sections:
                    request = CreateTopLevelSectionRequest(
                        projectConfigId=project_config_id,
                        implType=SectionType.Dict,
                        position=Position(),
                    )
                    response = await fixture.manager.create_top_level_section(request)
                    section_id = response.sectionId
                else:
                    section_id = next(iter(sections))

            if "codeObj" in id_types:
                code_objs = fixture.manager.project_state_backend.codeObjs
                if not code_objs:
                    if section_id is None:
                        raise AssertionError(
                            "No section ID available to seed code objects"
                        )
                    await fixture.manager.add_kwarg(
                        AddKwargRequest(
                            projectConfigId=project_config_id,
                            sectionId=section_id,
                        )
                    )

            canonical_ids_by_type, temporary_ids_by_type = _build_ids_by_type(
                fixture,
                id_types,
            )

            default_call_result = CallToolResult(
                content=[TextContent(type="text", text="")],
                isError=False,
            )

            for tool_name, annotations in tool_annotations_by_name.items():
                metadata = annotations.aiFollowToolResult
                if metadata is None:
                    result = build_tool_result_follow_ids(
                        tool_name=tool_name,
                        call_result=default_call_result,
                        dbe=fixture.dbe,
                        annotations_by_name=tool_annotations_by_name,
                    )
                    assert result is None, tool_name
                    continue

                call_result = _build_call_result_for_metadata(
                    metadata,
                    temporary_ids_by_type,
                )
                result = build_tool_result_follow_ids(
                    tool_name=tool_name,
                    call_result=call_result,
                    dbe=fixture.dbe,
                    annotations_by_name=tool_annotations_by_name,
                )
                assert isinstance(result, dict), tool_name
                for id_type, id_list in result.items():
                    assert isinstance(id_list, list), tool_name
                    assert all(isinstance(item, ID) for item in id_list), tool_name
                    if id_type in canonical_ids_by_type:
                        assert canonical_ids_by_type[id_type] in id_list, tool_name

    async def test_ignores_non_setta_tool_result_updates(self) -> None:
        async with real_project_manager() as fixture:
            mcp_client = MultiMCPClient({})

            tool_name = build_namespaced_tool_name("context7", "create_top_level_section")
            mcp_client.tool_annotations_by_name[tool_name] = SettaToolAnnotations(
                settaToolType=SettaToolType.discoverable,
                aiFollowToolResult=AIFollowToolResultMetadata(
                    pathsByIdType={"section": ["$"]},
                ),
            )

            call_result = CallToolResult(
                content=[TextContent(type="text", text="section-1")],
                isError=False,
            )

            result = build_tool_result_follow_ids(
                tool_name=tool_name,
                call_result=call_result,
                dbe=fixture.dbe,
                annotations_by_name=mcp_client.tool_annotations_by_name,
            )

            assert result is None
