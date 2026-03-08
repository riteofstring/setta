import asyncio
import logging
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

import anyio
import setta.project_state.base_project_manager  # noqa: F401
from fastapi import FastAPI
from mcp.client.session import ClientSession
from mcp.server.fastmcp.server import Context
from mcp.types import CallToolResult, TextContent, Tool
import pytest

from setta.agentic.agentic_scope import AgenticContext, AgenticScope
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
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
from setta.project_state.history import History
from setta.mcp.tool_registry import ensure_setta_mcp_tools_loaded
from setta.mcp.tool_metadata import (
    SettaToolType,
    ToolAccessMetadata,
    attach_tool_access,
)
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
from setta.types.llm_config import MCPServerConfig
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_agentic_edge, create_top_level_section
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.mcp.server import SettaFastMCP
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind

ensure_setta_mcp_tools_loaded()


def _seed_project_state(dbe: DBE, project_config_id: ID) -> None:
    project_config = ProjectConfig(id=project_config_id, name="Project")
    project_state = ProjectStateBackend(
        projectConfigs={project_config_id: project_config},
        projectChatWindowingByProjectConfigId={project_config_id: {}},
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
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=None,
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [
                item for item in actions if isinstance(item, EmitChunkAction)
            ]
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
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=None,
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [
                item for item in actions if isinstance(item, EmitChunkAction)
            ]
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
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=None,
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [
                item for item in actions if isinstance(item, EmitChunkAction)
            ]
            assert len(emit_actions) == 1
            chunk = emit_actions[0].chunk
            assert isinstance(chunk, ToolResultEvent)
            tool_message = chunk.result
            assert tool_message.is_error
            assert "not allowed" in tool_message.content[0].text

    async def test_setta_tool_meta_includes_frontend_affinity_token(self) -> None:
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

            tool_name = build_namespaced_tool_name(
                SETTA_MCP_SERVER_ID,
                "search_ui_settings",
            )
            mcp_client.routing[tool_name] = (SETTA_MCP_SERVER_ID, "search_ui_settings")
            captured_meta: list[dict[str, object | None] | None] = []

            async def _fake_call_tool(
                requested_tool_name: str,
                arguments: dict[str, object],
                meta: dict[str, object | None] | None = None,
            ) -> CallToolResult:
                assert requested_tool_name == tool_name
                assert arguments == {}
                captured_meta.append(meta)
                return CallToolResult(
                    content=[TextContent(type="text", text="ok")],
                    structuredContent={"ok": True},
                    isError=False,
                )

            setattr(mcp_client, "call_tool", _fake_call_tool)
            tool_call = ToolCall(
                id="tool-call-1",
                function=ToolCallFunction(
                    name=tool_name,
                    arguments={},
                ),
            )
            action = ExecuteToolCallsAction(
                project_config_id=project_config_id,
                chat_id=ID("chat-1"),
                tool_calls=[tool_call],
                allowed_server_ids={SETTA_MCP_SERVER_ID},
                share_session_id=None,
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=ID("section-1"),
                    frontend_affinity_token="frontend-1",
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [
                item for item in actions if isinstance(item, EmitChunkAction)
            ]
            assert len(emit_actions) == 1
            assert captured_meta == [
                {
                    "projectConfigId": "project-1",
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "frontendAffinityToken": "frontend-1",
                }
            ]

    async def test_setta_tool_meta_preserves_frontend_affinity_token_in_share_scope(
        self,
    ) -> None:
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

            tool_name = build_namespaced_tool_name(
                SETTA_MCP_SERVER_ID,
                "search_ui_settings",
            )
            mcp_client.routing[tool_name] = (SETTA_MCP_SERVER_ID, "search_ui_settings")
            captured_meta: list[dict[str, object | None] | None] = []

            async def _fake_call_tool(
                requested_tool_name: str,
                arguments: dict[str, object],
                meta: dict[str, object | None] | None = None,
            ) -> CallToolResult:
                assert requested_tool_name == tool_name
                assert arguments == {}
                captured_meta.append(meta)
                return CallToolResult(
                    content=[TextContent(type="text", text="ok")],
                    structuredContent={"ok": True},
                    isError=False,
                )

            setattr(mcp_client, "call_tool", _fake_call_tool)
            tool_call = ToolCall(
                id="tool-call-1",
                function=ToolCallFunction(
                    name=tool_name,
                    arguments={},
                ),
            )
            action = ExecuteToolCallsAction(
                project_config_id=project_config_id,
                chat_id=ID("chat-1"),
                tool_calls=[tool_call],
                allowed_server_ids={SETTA_MCP_SERVER_ID},
                share_session_id="share-session-1",
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=ID("section-1"),
                    frontend_affinity_token="frontend-1",
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [
                item for item in actions if isinstance(item, EmitChunkAction)
            ]
            assert len(emit_actions) == 1
            assert captured_meta == [
                {
                    "projectConfigId": "project-1",
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "frontendAffinityToken": "frontend-1",
                    "shareSessionId": "share-session-1",
                }
            ]

    async def test_setta_tool_meta_includes_linked_chat_recursion_metadata(
        self,
    ) -> None:
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

            tool_name = build_namespaced_tool_name(
                SETTA_MCP_SERVER_ID,
                "search_ui_settings",
            )
            mcp_client.routing[tool_name] = (SETTA_MCP_SERVER_ID, "search_ui_settings")
            captured_meta: list[dict[str, object | None] | None] = []

            async def _fake_call_tool(
                requested_tool_name: str,
                arguments: dict[str, object],
                meta: dict[str, object | None] | None = None,
            ) -> CallToolResult:
                assert requested_tool_name == tool_name
                assert arguments == {}
                captured_meta.append(meta)
                return CallToolResult(
                    content=[TextContent(type="text", text="ok")],
                    structuredContent={"ok": True},
                    isError=False,
                )

            setattr(mcp_client, "call_tool", _fake_call_tool)
            tool_call = ToolCall(
                id="tool-call-1",
                function=ToolCallFunction(
                    name=tool_name,
                    arguments={},
                ),
            )
            action = ExecuteToolCallsAction(
                project_config_id=project_config_id,
                chat_id=ID("chat-1"),
                tool_calls=[tool_call],
                allowed_server_ids={SETTA_MCP_SERVER_ID},
                share_session_id=None,
                agentic_context=AgenticContext(
                    project_config_id=project_config_id,
                    chat_id=ID("chat-1"),
                    section_id=ID("section-1"),
                    linked_chat_invocation_depth=1,
                    linked_chat_invocation_chain_section_ids=(
                        ID("section-root"),
                        ID("section-mid"),
                    ),
                ),
            )

            actions = await executor.apply(action)

            emit_actions = [
                item for item in actions if isinstance(item, EmitChunkAction)
            ]
            assert len(emit_actions) == 1
            assert captured_meta == [
                {
                    "projectConfigId": "project-1",
                    "chatId": "chat-1",
                    "sectionId": "section-1",
                    "frontendAffinityToken": None,
                    "linkedChatInvocationDepth": 1,
                    "linkedChatInvocationChainSectionIds": [
                        "section-root",
                        "section-mid",
                    ],
                }
            ]

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
            create_agentic_edge(
                project_state,
                AgenticEdge(
                    id=create_new_id(),
                    sourceSectionId=chat_section_id,
                    targetSectionId=allowed_section_id,
                    kind=AgenticEdgeKind.chat_section,
                ),
            )
            backend_state = ProjectStateBackend(
                projectConfigs={project_config_id: project_state.projectConfig},
                projectChatWindowingByProjectConfigId={project_config_id: {}},
                defaultProjectConfigId=project_config_id,
                sections=project_state.sections,
                sectionImpls=project_state.sectionImpls,
                sectionVariants=project_state.sectionVariants,
                codeObjs=project_state.codeObjs,
                codeObjImpls=project_state.codeObjImpls,
                codeObjVariants=project_state.codeObjVariants,
            )
            dbe.write_project(backend_state)

            temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
            _ = convert_canonical_ids_to_temporary(
                [
                    project_config_id,
                    chat_section_id,
                    allowed_section_id,
                    blocked_section_id,
                ],
                canonical_to_temporary,
                temporary_to_canonical,
            )
            dbe.write_temporary_id_map(canonical_to_temporary)
            tmp_project_config_id = canonical_to_temporary[project_config_id]
            tmp_blocked_section_id = canonical_to_temporary[blocked_section_id]

            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager)
            manager = SimpleNamespace(
                project_state_backend=backend_state,
                history=History(backend_state),
            )

            def _get_manager(requested_project_config_id: ID, *, share_session_id=None):
                del share_session_id
                if requested_project_config_id != project_config_id:
                    raise KeyError(
                        f"Unexpected project config id: {requested_project_config_id}"
                    )
                return manager

            state = SimpleNamespace(
                project_manager_switcher=SimpleNamespace(get=_get_manager),
                dbe=dbe,
                deployment_mode=False,
            )
            app = FastAPI()
            mcp_server = SettaFastMCP(
                app,
                state,
                "/mcp-test",
                "Test MCP Server",
                frontend_sender,
                dbe,
            )
            scope_tool_calls = 0

            async def scope_probe_tool(
                *,
                projectConfigId: ID,
                sectionId: ID,
                ctx: Context,
            ) -> object:
                del projectConfigId, sectionId, ctx
                nonlocal scope_tool_calls
                scope_tool_calls += 1
                return {"ok": True}

            attach_tool_access(
                scope_probe_tool,
                ToolAccessMetadata(
                    accessType="write",
                    idPathsByType={"section": ["sectionId"]},
                ),
            )
            mcp_server._register_setta_tool(
                scope_probe_tool, SettaToolType.discoverable
            )
            mcp_client = MultiMCPClient(
                {
                    SETTA_MCP_SERVER_ID: MCPServerConfig(
                        transport="stdio",
                        command="noop",
                    )
                }
            )
            client_send, server_receive = anyio.create_memory_object_stream(0)
            server_send, client_receive = anyio.create_memory_object_stream(0)
            server_task = asyncio.create_task(
                mcp_server._mcp_server.run(
                    server_receive,
                    server_send,
                    mcp_server._mcp_server.create_initialization_options(),
                )
            )
            try:
                async with ClientSession(client_receive, client_send) as session:
                    await session.initialize()
                    tools_result = await session.list_tools()
                    mcp_client._sessions[SETTA_MCP_SERVER_ID] = session
                    mcp_client._update_tool_cache_for_server(
                        SETTA_MCP_SERVER_ID,
                        list(tools_result.tools),
                    )
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
                            name=build_namespaced_tool_name(
                                SETTA_MCP_SERVER_ID, "scope_probe_tool"
                            ),
                            arguments={
                                "projectConfigId": str(tmp_project_config_id),
                                "sectionId": str(tmp_blocked_section_id),
                            },
                        ),
                    )
                    action = ExecuteToolCallsAction(
                        project_config_id=project_config_id,
                        chat_id=ID("chat-1"),
                        tool_calls=[tool_call],
                        allowed_server_ids={SETTA_MCP_SERVER_ID},
                        share_session_id=None,
                        agentic_context=AgenticContext(
                            project_config_id=project_config_id,
                            chat_id=ID("chat-1"),
                            section_id=chat_section_id,
                        ),
                    )

                    actions = await executor.apply(action)

                    emit_actions = [
                        item for item in actions if isinstance(item, EmitChunkAction)
                    ]
                    assert len(emit_actions) == 1
                    chunk = emit_actions[0].chunk
                    assert isinstance(chunk, ToolResultEvent)
                    tool_message = chunk.result
                    assert tool_message.is_error
                    assert scope_tool_calls == 0

                    structured = tool_message.result["structuredContent"]
                    assert structured["error"] == "ScopeViolation"

                    missing_edges_canonical = structured.get("missingEdgesCanonical")
                    assert isinstance(missing_edges_canonical, list)
                    assert missing_edges_canonical
                    assert missing_edges_canonical[0]["sourceSectionId"] == str(
                        chat_section_id
                    )
                    assert missing_edges_canonical[0]["targetSectionId"] == str(
                        blocked_section_id
                    )
            finally:
                server_task.cancel()
                await asyncio.gather(server_task, return_exceptions=True)
                await client_send.aclose()
                await client_receive.aclose()
                await server_send.aclose()
                await server_receive.aclose()
