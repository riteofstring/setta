import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from litellm.types.utils import (
    ChatCompletionDeltaToolCall,
    Delta,
    Function,
    ModelResponseStream,
)
from setta.database.db_objs import DBE
from setta.llm.llm_chat_manager import LLMChatManager, ToolCallStreamState
from setta.mcp.client import MCPClient
from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    SettaToolAnnotations,
    SettaToolType,
)
from setta.types.chat_messages import AssistantChatMessage
from setta.types.id import ID
from setta.types.websocket import (
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
)
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from tests.utils.project_summary import build_project_summary_switcher


class LLMChatManagerStreamingFollowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.dbe = DBE(Path(self.temp_dir.name))
        self.websocket_manager = WebsocketManager()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.mcp_client = MCPClient("http://localhost")
        project_manager_switcher = build_project_summary_switcher(ID("project-1"))
        self.manager = LLMChatManager(
            self.dbe,
            self.mcp_client,
            self.frontend_sender,
            project_manager_switcher,
        )
        self.mcp_client.tool_annotations_by_name = {
            "follow_tool": SettaToolAnnotations(
                settaToolType=SettaToolType.discoverable,
                aiFollowToolArguments=AIFollowToolArgumentsMetadata(
                    pathsByIdType={"section": ["sectionId", "sectionIds"]},
                ),
            )
        }
        self.websocket_id = "stream-follow-socket"
        self._sent_messages: list[Message] = []
        self._receive_counter = 0

        async def _receive() -> Message:
            if self._receive_counter == 0:
                self._receive_counter += 1
                return {"type": "websocket.connect"}
            return {"type": "websocket.receive"}

        async def _send(message: Message) -> None:
            self._sent_messages.append(message)

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
        self._websocket = WebSocket(scope=scope, receive=_receive, send=_send)
        await self._websocket.accept()
        self.websocket_manager.sockets[self.websocket_id] = (
            WebsocketConnectionInfoWithSocket(
                id=self.websocket_id,
                connectionType=WebsocketConnectionType.FRONTEND,
                currentAddress=None,
                websocket=self._websocket,
            )
        )

    async def asyncTearDown(self) -> None:
        self.websocket_manager.sockets.pop(self.websocket_id, None)
        await self._websocket.close()
        self.temp_dir.cleanup()

    async def test_streaming_follow_updates_on_partial_tool_args(self) -> None:
        canonical_to_temporary = {
            ID("section-a"): ID("temp-1"),
            ID("section-b"): ID("temp-2"),
        }
        self.dbe.write_temporary_id_map(canonical_to_temporary)

        chat_id = ID("chat-1")
        project_config_id = ID("project-1")
        assistant_message = AssistantChatMessage(content=[])
        tool_call_state = ToolCallStreamState()

        chunk_one = self._build_stream_chunk('{"sectionId":"temp-1"')
        await self.manager._handle_stream_chunk(
            chat_id,
            assistant_message,
            chunk_one,
            tool_call_state,
            project_config_id,
        )
        follow_updates = self._collect_follow_updates()
        self.assertEqual(1, len(follow_updates))
        self.assertEqual(
            {"section-a"},
            set(follow_updates[-1]["content"]["idsByType"]["section"]),
        )

        chunk_two = self._build_stream_chunk(
            ',"sectionIds":["temp-1","temp-2"]'
        )
        await self.manager._handle_stream_chunk(
            chat_id,
            assistant_message,
            chunk_two,
            tool_call_state,
            project_config_id,
        )
        follow_updates = self._collect_follow_updates()
        self.assertEqual(2, len(follow_updates))
        self.assertEqual(
            {"section-a", "section-b"},
            set(follow_updates[-1]["content"]["idsByType"]["section"]),
        )

        chunk_three = self._build_stream_chunk("}")
        await self.manager._handle_stream_chunk(
            chat_id,
            assistant_message,
            chunk_three,
            tool_call_state,
            project_config_id,
        )
        follow_updates = self._collect_follow_updates()
        self.assertEqual(2, len(follow_updates))

        await self.manager._finalize_tool_calls(
            assistant_message,
            tool_call_state,
            chat_id,
            project_config_id,
        )
        follow_updates = self._collect_follow_updates()
        self.assertEqual(3, len(follow_updates))
        self.assertEqual(
            {"section-a", "section-b"},
            set(follow_updates[-1]["content"]["idsByType"]["section"]),
        )

    def _build_stream_chunk(self, arguments_delta: str) -> ModelResponseStream:
        delta = Delta(
            tool_calls=[
                ChatCompletionDeltaToolCall(
                    index=0,
                    id="tool-call-1",
                    type="function",
                    function=Function(name="follow_tool", arguments=arguments_delta),
                )
            ]
        )
        payload = {
            "id": "stream-1",
            "created": 0,
            "model": "gpt-4o",
            "object": "chat.completion.chunk",
            "choices": [
                {
                    "delta": delta,
                    "index": 0,
                    "finish_reason": None,
                    "logprobs": None,
                }
            ],
        }
        return ModelResponseStream.model_validate(payload)

    def _collect_follow_updates(self) -> list[dict]:
        follow_updates: list[dict] = []
        for message in self._sent_messages:
            if message.get("type") != "websocket.send" or "text" not in message:
                continue
            payload = json.loads(message["text"])
            if payload.get("messageType") == "AIFollowToolArgumentsUpdate":
                follow_updates.append(payload)
        return follow_updates


if __name__ == "__main__":
    unittest.main()
