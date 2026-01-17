import logging
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from mcp.types import Tool

from setta.database.db_objs import DBE
from setta.llm.chat_store import DBEChatStore
from setta.llm.chat_toolkit.history import ChatHistory
from setta.llm.chat_toolkit.managed.action_executor import ManagedActionExecutor
from setta.llm.chat_toolkit.managed.actions import (
    AppendMessagesAction,
    EmitChunkAction,
    ExecuteToolCallsAction,
)
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
    ToolReferenceContent,
    UserChatMessage,
)
from setta.types.chat_stream_events import ToolResultEvent
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class ManagedActionExecutorTests(unittest.IsolatedAsyncioTestCase):
    async def test_execute_search_tool_emits_result(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MultiMCPClient({})
            tool = Tool(
                name="alpha_tool",
                description="alpha tool",
                inputSchema={"type": "object", "properties": {}},
            )
            mcp_client._update_tool_cache_for_server(SETTA_MCP_SERVER_ID, [tool])
            history = ChatHistory(DBEChatStore(dbe))
            executor = ManagedActionExecutor(
                chat_history=history,
                websocket_msg_handler=frontend_sender,
                mcp_client=mcp_client,
                dbe=dbe,
                search_tool_name=build_namespaced_tool_name(
                    SETTA_MCP_SERVER_ID, C.SEARCH_MCP_TOOLS_NAME
                ),
                logger=logging.getLogger(__name__),
            )

            search_tool_name = build_namespaced_tool_name(
                SETTA_MCP_SERVER_ID,
                C.SEARCH_MCP_TOOLS_NAME,
            )
            tool_call = ToolCall(
                id="tool-call-1",
                function=ToolCallFunction(
                    name=search_tool_name,
                    arguments={"query": "alpha", "limit": 1},
                ),
            )
            action = ExecuteToolCallsAction(
                project_config_id=ID("project-1"),
                chat_id=ID("chat-1"),
                tool_calls=[tool_call],
                allowed_server_ids={SETTA_MCP_SERVER_ID},
                share_session_id=None,
            )

            actions = await executor.apply(action)

            emit_actions = [item for item in actions if isinstance(item, EmitChunkAction)]
            self.assertEqual(len(emit_actions), 1)
            chunk = emit_actions[0].chunk
            self.assertIsInstance(chunk, ToolResultEvent)
            tool_message = chunk.result
            reference_names = [
                entry.tool_name
                for entry in tool_message.content
                if isinstance(entry, ToolReferenceContent)
            ]
            self.assertIn(
                build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "alpha_tool"),
                reference_names,
            )

    async def test_append_messages_persists_chat(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MultiMCPClient({})
            history = ChatHistory(DBEChatStore(dbe))
            executor = ManagedActionExecutor(
                chat_history=history,
                websocket_msg_handler=frontend_sender,
                mcp_client=mcp_client,
                dbe=dbe,
                search_tool_name=build_namespaced_tool_name(
                    SETTA_MCP_SERVER_ID, C.SEARCH_MCP_TOOLS_NAME
                ),
                logger=logging.getLogger(__name__),
            )

            llm_config = LLMConfig(id="default", model="gpt-4o")
            chat = history.create(
                UserChatMessage(content=[MessageTextContent(text="Hello")]),
                llm_config,
                project_config_id=ID("project-1"),
            )
            append_action = AppendMessagesAction(
                chat_id=chat.id,
                messages=[
                    AssistantChatMessage(
                        content=[MessageTextContent(text="Hi")],
                    )
                ],
            )

            await executor.apply(append_action)

            updated = history.require(chat.id)
            self.assertEqual(len(updated.messages), 2)

    async def test_missing_tool_emits_error_result(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MultiMCPClient({})
            history = ChatHistory(DBEChatStore(dbe))
            executor = ManagedActionExecutor(
                chat_history=history,
                websocket_msg_handler=frontend_sender,
                mcp_client=mcp_client,
                dbe=dbe,
                search_tool_name=build_namespaced_tool_name(
                    SETTA_MCP_SERVER_ID, C.SEARCH_MCP_TOOLS_NAME
                ),
                logger=logging.getLogger(__name__),
            )

            tool_call = ToolCall(
                id="tool-call-1",
                function=ToolCallFunction(
                    name="setta__missing_tool",
                    arguments={},
                ),
            )
            action = ExecuteToolCallsAction(
                project_config_id=ID("project-1"),
                chat_id=ID("chat-1"),
                tool_calls=[tool_call],
                allowed_server_ids=set(),
                share_session_id=None,
            )

            actions = await executor.apply(action)

            emit_actions = [item for item in actions if isinstance(item, EmitChunkAction)]
            self.assertEqual(len(emit_actions), 1)
            chunk = emit_actions[0].chunk
            self.assertIsInstance(chunk, ToolResultEvent)
            tool_message = chunk.result
            self.assertTrue(tool_message.is_error)
            self.assertIn(C.SEARCH_MCP_TOOLS_NAME, tool_message.content[0].text)


if __name__ == "__main__":
    unittest.main()
