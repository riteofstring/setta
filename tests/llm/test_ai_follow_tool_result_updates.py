import json
import unittest

from mcp.types import CallToolResult, TextContent
from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.client import MCPClient
from setta.mcp.tool_metadata import (
    AIFollowToolResultMetadata,
    SettaToolAnnotations,
    SettaToolType,
)
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.project_state.project_manager_types import CreateTopLevelSectionRequest
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.section_impls import SectionType
from setta.types.websocket import (
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from tests.utils.manager_fixture import real_project_manager


class AIFollowToolResultUpdateTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_top_level_section_triggers_follow_update(self) -> None:
        async with real_project_manager() as fixture:
            websocket_manager = fixture.websocket_manager
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MCPClient("http://localhost")
            chat_manager = LLMChatManager(
                fixture.dbe,
                mcp_client,
                frontend_sender,
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
                section_id = await fixture.manager.create_top_level_section(request)

                temporary_to_canonical, canonical_to_temporary = (
                    fixture.dbe.read_temporary_id_map()
                )
                temporary_section_id = convert_canonical_ids_to_temporary(
                    section_id,
                    canonical_to_temporary,
                    temporary_to_canonical,
                )
                fixture.dbe.write_temporary_id_map(canonical_to_temporary)

                call_result = CallToolResult(
                    content=[
                        TextContent(type="text", text=str(temporary_section_id))
                    ],
                    isError=False,
                )

                mcp_client.tool_annotations_by_name[
                    "create_top_level_section"
                ] = SettaToolAnnotations(
                    settaToolType=SettaToolType.discoverable,
                    aiFollowToolResult=AIFollowToolResultMetadata(
                        pathsByIdType={"section": ["$"]},
                    ),
                )

                chat_id = ID("chat-1")
                await chat_manager._maybe_broadcast_ai_follow_tool_result_update(
                    "create_top_level_section",
                    call_result,
                    project_config_id,
                    chat_id,
                )

                follow_updates = [
                    json.loads(message["text"])
                    for message in sent_messages
                    if message.get("type") == "websocket.send"
                    and "text" in message
                    and json.loads(message["text"]).get("messageType")
                    == "AIFollowToolResultUpdate"
                ]

                self.assertEqual(1, len(follow_updates))
                payload = follow_updates[0]["content"]
                self.assertEqual(str(project_config_id), payload["projectConfigId"])
                self.assertEqual(str(chat_id), payload["chatId"])
                self.assertIn(str(section_id), payload["idsByType"]["section"])
            finally:
                websocket_manager.sockets.pop(websocket_id, None)
                await websocket.close()


if __name__ == "__main__":
    unittest.main()
