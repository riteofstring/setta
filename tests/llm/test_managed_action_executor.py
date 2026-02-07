import logging
from pathlib import Path
from tempfile import TemporaryDirectory

from mcp.types import Tool
import pytest

from setta.agentic.agentic_scope import AgenticContext, AgenticScope
from setta.database.db_objs import DBE
from setta.llm.chat_store import AgentRunChatStore
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
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _seed_project_state(dbe: DBE, project_config_id: ID) -> None:
    project_config = ProjectConfig(id=project_config_id, name="Project")
    project_state = ProjectStateBackend(
        projectConfigs={project_config_id: project_config},
        defaultProjectConfigId=project_config_id,
    )
    dbe.write_project(project_state)


def _build_agentic_scope() -> AgenticScope:
    return AgenticScope(
        read_section_ids=set(),
        write_section_ids=set(),
        context_section_ids=set(),
        peer_chat_section_ids=set(),
        structural_allowed=True,
    )


class TestManagedActionExecutor:
    pytestmark = pytest.mark.asyncio

    async def test_execute_search_tool_emits_result(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            project_config_id = ID("project-1")
            _seed_project_state(dbe, project_config_id)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MultiMCPClient({})
            tool = Tool(
                name="alpha_tool",
                description="alpha tool",
                inputSchema={"type": "object", "properties": {}},
            )
            mcp_client._update_tool_cache_for_server(SETTA_MCP_SERVER_ID, [tool])
            history = ChatHistory(AgentRunChatStore(dbe))
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
                project_config_id=project_config_id,
                chat_id=ID("chat-1"),
                tool_calls=[tool_call],
                allowed_server_ids={SETTA_MCP_SERVER_ID},
                share_session_id=None,
                agentic_scope=_build_agentic_scope(),
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=None,
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [item for item in actions if isinstance(item, EmitChunkAction)]
            assert len(emit_actions) == 1
            chunk = emit_actions[0].chunk
            assert isinstance(chunk, ToolResultEvent)
            tool_message = chunk.result
            reference_names = [
                entry.tool_name
                for entry in tool_message.content
                if isinstance(entry, ToolReferenceContent)
            ]
            assert reference_names == [
                build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "alpha_tool")
            ]

    async def test_append_messages_persists_chat(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            _seed_project_state(dbe, ID("project-1"))
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MultiMCPClient({})
            history = ChatHistory(AgentRunChatStore(dbe))
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
            assert len(updated.messages) == 2

    async def test_missing_tool_emits_error_result(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            project_config_id = ID("project-1")
            _seed_project_state(dbe, project_config_id)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MultiMCPClient({})
            history = ChatHistory(AgentRunChatStore(dbe))
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
                project_config_id=project_config_id,
                chat_id=ID("chat-1"),
                tool_calls=[tool_call],
                allowed_server_ids=set(),
                share_session_id=None,
                agentic_scope=_build_agentic_scope(),
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=None,
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [item for item in actions if isinstance(item, EmitChunkAction)]
            assert len(emit_actions) == 1
            chunk = emit_actions[0].chunk
            assert isinstance(chunk, ToolResultEvent)
            tool_message = chunk.result
            assert tool_message.is_error
            assert C.SEARCH_MCP_TOOLS_NAME in tool_message.content[0].text

    async def test_disallowed_tool_emits_error_result(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            project_config_id = ID("project-1")
            _seed_project_state(dbe, project_config_id)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MultiMCPClient({})
            history = ChatHistory(AgentRunChatStore(dbe))
            tool = Tool(
                name="alpha_tool",
                description="alpha tool",
                inputSchema={"type": "object", "properties": {}},
            )
            mcp_client._update_tool_cache_for_server("alpha-server", [tool])
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
                    name=build_namespaced_tool_name("alpha-server", "alpha_tool"),
                    arguments={},
                ),
            )
            action = ExecuteToolCallsAction(
                project_config_id=project_config_id,
                chat_id=ID("chat-1"),
                tool_calls=[tool_call],
                allowed_server_ids=set(),
                share_session_id=None,
                agentic_scope=_build_agentic_scope(),
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=None,
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [item for item in actions if isinstance(item, EmitChunkAction)]
            assert len(emit_actions) == 1
            chunk = emit_actions[0].chunk
            assert isinstance(chunk, ToolResultEvent)
            tool_message = chunk.result
            assert tool_message.is_error
            assert "not allowed" in tool_message.content[0].text

    async def test_scope_blocked_tool_emits_error_result(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            project_config_id = ID("project-1")
            settings = SettingsState()
            project_state = ProjectStateSingleConfig(
                projectConfig=ProjectConfig(id=project_config_id, name="Project")
            )
            chat_section_id = create_top_level_section(
                settings,
                project_state,
                SectionType.Chat,
                Position(),
            )
            allowed_section_id = create_top_level_section(
                settings,
                project_state,
                SectionType.TextBlock,
                Position(),
            )
            blocked_section_id = create_top_level_section(
                settings,
                project_state,
                SectionType.Dict,
                Position(),
            )
            backend_state = ProjectStateBackend(
                projectConfigs={project_config_id: project_state.projectConfig},
                defaultProjectConfigId=project_config_id,
                sections=project_state.sections,
                sectionImpls=project_state.sectionImpls,
                sectionVariants=project_state.sectionVariants,
                codeObjs=project_state.codeObjs,
                codeObjImpls=project_state.codeObjImpls,
                codeObjVariants=project_state.codeObjVariants,
            )
            dbe.write_project(backend_state)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            mcp_client = MultiMCPClient({})
            tool = Tool(
                name="set_code",
                description="set code",
                inputSchema={
                    "type": "object",
                    "properties": {"sectionId": {"type": "string"}},
                },
                annotations=SettaToolAnnotations(
                    settaToolType=SettaToolType.discoverable,
                    accessType="write",
                    idPathsByType={"section": ["sectionId"]},
                ),
            )
            mcp_client._update_tool_cache_for_server(SETTA_MCP_SERVER_ID, [tool])
            history = ChatHistory(AgentRunChatStore(dbe))
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
                    name=build_namespaced_tool_name(SETTA_MCP_SERVER_ID, "set_code"),
                    arguments={"sectionId": str(blocked_section_id)},
                ),
            )
            action = ExecuteToolCallsAction(
                project_config_id=project_config_id,
                chat_id=ID("chat-1"),
                tool_calls=[tool_call],
                allowed_server_ids={SETTA_MCP_SERVER_ID},
                share_session_id=None,
                agentic_scope=AgenticScope(
                    read_section_ids={allowed_section_id},
                    write_section_ids={allowed_section_id},
                    context_section_ids=set(),
                    peer_chat_section_ids=set(),
                    structural_allowed=False,
                ),
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=chat_section_id,
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [item for item in actions if isinstance(item, EmitChunkAction)]
            assert len(emit_actions) == 1
            chunk = emit_actions[0].chunk
            assert isinstance(chunk, ToolResultEvent)
            tool_message = chunk.result
            assert tool_message.is_error
            assert "ScopeViolation" in tool_message.result["structuredContent"]["error"]
