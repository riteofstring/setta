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
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
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
        self.mcp_client = MultiMCPClient({})
        project_manager_switcher = build_project_summary_switcher(ID("project-1"))
        self.manager = LLMChatManager(
            self.dbe,
            self.mcp_client,
            self.frontend_sender,
            project_manager_switcher,
        )
        namespaced_tool_name = build_namespaced_tool_name(
            SETTA_MCP_SERVER_ID,
            "follow_tool",
        )
        self.mcp_client.tool_annotations_by_name = {
            namespaced_tool_name: SettaToolAnnotations(
                settaToolType=SettaToolType.discoverable,
                aiFollowToolArguments=AIFollowToolArgumentsMetadata(
                    pathsByIdType={"section": ["sectionId", "sectionIds"]},
                ),
            )
        }
        self._namespaced_tool_name = namespaced_tool_name
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

    def _build_stream_chunk(self, arguments_delta: str) -> ModelResponseStream:
        delta = Delta(
            tool_calls=[
                ChatCompletionDeltaToolCall(
                    index=0,
                    id="tool-call-1",
                    type="function",
                    function=Function(
                        name=self._namespaced_tool_name, arguments=arguments_delta
                    ),
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
