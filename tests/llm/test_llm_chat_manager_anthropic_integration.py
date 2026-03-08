import logging
import os
import warnings
import socket
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from setta.agentic.store import load_agent_run, save_engine_configs
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, build_namespaced_tool_name
from setta.types.agentic import AgentProfile, AgentRunStatus, EngineConfig, EngineType
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.llm_config import AllLLMConfigs, LLMConfig, MCPServerConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests import apply_warning_filters
from tests.utils.integration_env import seed_env_from_repo_dot_env
from tests.utils.mcp_runner_fixture import build_runner_with_local_mcp_session


def _extract_last_assistant_text(messages_out: list[dict]) -> str | None:
    for message in reversed(messages_out):
        if not isinstance(message, dict):
            continue
        if message.get("role") != "assistant":
            continue
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if isinstance(text, str):
                    return text
    return None


def _extract_finalized_assistant_text(events) -> str | None:
    for event in reversed(events):
        if event.type != "stream_chunk":
            continue
        payload = event.payload
        if not isinstance(payload, dict):
            continue
        chunk = payload.get("chunk")
        if not isinstance(chunk, dict):
            continue
        if chunk.get("type") != "message_finalized":
            continue
        message = chunk.get("message")
        if not isinstance(message, dict):
            continue
        if message.get("role") != "assistant":
            continue
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if isinstance(text, str):
                    return text
    return None


def _collect_stream_text_from_events(events) -> tuple[str, int]:
    text_by_index: dict[int, list[str]] = {}
    delta_count = 0
    for event in events:
        if event.type != "stream_chunk":
            continue
        payload = event.payload
        if not isinstance(payload, dict):
            continue
        chunk = payload.get("chunk")
        if not isinstance(chunk, dict):
            continue
        if chunk.get("type") != "delta":
            continue
        content = chunk.get("content")
        if not isinstance(content, list):
            continue
        for entry in content:
            if not isinstance(entry, dict):
                continue
            if entry.get("type") != "text_delta":
                continue
            index = entry.get("index")
            text = entry.get("text")
            if not isinstance(index, int) or not isinstance(text, str):
                continue
            text_by_index.setdefault(index, []).append(text)
            delta_count += 1
    combined = "".join(
        "".join(text_by_index[index]) for index in sorted(text_by_index)
    )
    return combined, delta_count


class TestLLMChatManagerAnthropicIntegration:
    pytestmark = pytest.mark.asyncio

    @staticmethod
    def _suppress_llm_logs() -> None:
        logging.getLogger("litellm").setLevel(logging.WARNING)
        logging.getLogger("litellm.utils").setLevel(logging.WARNING)
        logging.getLogger("LiteLLM").setLevel(logging.WARNING)

    def _require_anthropic_key(self) -> str:
        seed_env_from_repo_dot_env(("ANTHROPIC_API_KEY",))
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            pytest.skip("ANTHROPIC_API_KEY not set")
        try:
            socket.getaddrinfo("api.anthropic.com", 443)
            with socket.create_connection(
                ("api.anthropic.com", 443),
                timeout=3,
            ):
                pass
        except OSError:
            pytest.skip("Cannot connect to api.anthropic.com:443")
        return api_key

    async def test_claude_sonnet_45_chat_completion(self) -> None:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=r"^Pydantic serializer warnings:",
                category=UserWarning,
                module=r"pydantic.*",
            )
            apply_warning_filters()
            self._suppress_llm_logs()
            api_key = self._require_anthropic_key()

            with TemporaryDirectory() as tmpdir:
                dbe = DBE(Path(tmpdir) / "setta_files")
                project_config = ProjectConfig()
                project_state = ProjectStateBackend(
                    projectConfigs={project_config.id: project_config},
                    defaultProjectConfigId=project_config.id,
                )
                dbe.write_project(project_state)
                dbe.write_json(
                    dbe.settings,
                    {"backend": {"completionGuardEnabled": False}},
                )

                websocket_manager = WebsocketManager()
                frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
                runner = AgentRunner(
                    dbe,
                    MultiMCPClient({}, disabled=True),
                    frontend_sender,
                )

                llm_config = LLMConfig(
                    id="claude-sonnet",
                    model="claude-sonnet-4-5-20250929",
                    provider="anthropic",
                    api_key_env="ANTHROPIC_API_KEY",
                    other_params={"temperature": 1},
                    mcpServerIds=[],
                )
                runner.update_config(AllLLMConfigs(configs={llm_config.id: llm_config}))
                runner.update_api_keys({"ANTHROPIC_API_KEY": api_key})

                engine_config = EngineConfig(
                    id="engine-claude-sonnet",
                    name="Claude Sonnet 4.5",
                    engineType=EngineType.setta_llm,
                    settaLlmConfigId=llm_config.id,
                )
                save_engine_configs(dbe, [engine_config])

                profile = AgentProfile(
                    name="Claude Sonnet 4.5",
                    engineConfigId=engine_config.id,
                )

                first_messages = [
                    UserChatMessage(
                        content=[
                            MessageTextContent(
                                text="Reply with exactly: HELLO",
                            )
                        ]
                    )
                ]

                first_run = runner.start_run(
                    profile,
                    {
                        "messages": [
                            message.model_dump(mode="json") for message in first_messages
                        ],
                        "thinking": True,
                        "allowUnscoped": True,
                    },
                    emit_stream=False,
                    emit_ai_follow=False,
                )

                completed_first = await runner.wait_for_run(first_run.id, timeout=120)
                if completed_first.status != AgentRunStatus.completed:
                    error = None
                    for event in reversed(completed_first.events):
                        if event.type != "run_failed":
                            continue
                        payload = event.payload
                        if isinstance(payload, dict):
                            error = payload.get("error")
                        break
                    pytest.fail(f"Claude Sonnet 4.5 initial run failed: {error}")
                outputs = completed_first.outputs
                assert isinstance(outputs, dict)
                if not isinstance(outputs, dict):
                    raise AssertionError("Expected outputs to be a dict")
                final_text = outputs.get("finalText")
                assert isinstance(final_text, str)
                if not isinstance(final_text, str):
                    raise AssertionError("Expected finalText to be a string")
                assert final_text.strip() == "HELLO"
                metadata = outputs.get("metadata")
                assert isinstance(metadata, dict)
                if not isinstance(metadata, dict):
                    raise AssertionError("Expected metadata to be a dict")
                assert metadata.get("engineConfigId") == str(engine_config.id)
                assert metadata.get("llmConfigId") == llm_config.id
                assert metadata.get("model") == llm_config.model
                assert metadata.get("provider") == llm_config.provider
                assert metadata.get("thinking") is True
                assert metadata.get("projectConfigId") == str(project_config.id)
                assert metadata.get("chatId") == str(first_run.id)
                # Integration assertion: usage is persisted from real provider/runtime
                # token accounting and includes model context window capacity.
                usage = outputs.get("usage")
                assert isinstance(usage, dict)
                context_window_tokens = usage.get("contextWindowTokens")
                prompt_tokens = usage.get("promptTokens")
                completion_tokens = usage.get("completionTokens")
                total_tokens = usage.get("totalTokens")
                assert isinstance(context_window_tokens, int)
                assert isinstance(prompt_tokens, int)
                assert isinstance(completion_tokens, int)
                assert isinstance(total_tokens, int)
                assert context_window_tokens > 0
                assert prompt_tokens > 0
                assert completion_tokens > 0
                assert total_tokens == prompt_tokens + completion_tokens
                assert context_window_tokens >= total_tokens
                messages_out = (
                    outputs.get("messages") if isinstance(outputs, dict) else None
                )
                assert isinstance(messages_out, list)
                if not isinstance(messages_out, list):
                    raise AssertionError("Expected message history from initial run")
                assistant_text = _extract_last_assistant_text(messages_out)
                assert isinstance(assistant_text, str)
                if not isinstance(assistant_text, str):
                    raise AssertionError("Expected assistant text from initial run")
                assert assistant_text.strip() == final_text.strip()

                thinking_blocks: list[dict] = []
                for message in messages_out:
                    if (
                        not isinstance(message, dict)
                        or message.get("role") != "assistant"
                    ):
                        continue
                    content = message.get("content")
                    if not isinstance(content, list):
                        continue
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "thinking":
                            thinking_blocks.append(block)
                assert thinking_blocks
                assert (
                    all(
                        isinstance(block.get("signature"), str) and block["signature"]
                        for block in thinking_blocks
                    )
                )

                followup_message = UserChatMessage(
                    content=[MessageTextContent(text="Reply with exactly: OK")]
                ).model_dump(mode="json")
                history = list(messages_out) + [followup_message]

                second_run = runner.start_run(
                    profile,
                    {"messages": history, "thinking": True, "allowUnscoped": True},
                    emit_stream=False,
                    emit_ai_follow=False,
                )

                completed_second = await runner.wait_for_run(second_run.id, timeout=120)
                if completed_second.status != AgentRunStatus.completed:
                    error = None
                    for event in reversed(completed_second.events):
                        if event.type != "run_failed":
                            continue
                        payload = event.payload
                        if isinstance(payload, dict):
                            error = payload.get("error")
                        break
                    pytest.fail(f"Claude Sonnet 4.5 follow-up run failed: {error}")
                second_outputs = completed_second.outputs
                assert isinstance(second_outputs, dict)
                if not isinstance(second_outputs, dict):
                    raise AssertionError("Expected outputs to be a dict")
                second_final_text = second_outputs.get("finalText")
                assert isinstance(second_final_text, str)
                if not isinstance(second_final_text, str):
                    raise AssertionError("Expected finalText to be a string")
                assert second_final_text.strip() == "OK"

                loaded_first = load_agent_run(dbe, first_run.id)
                assert loaded_first is not None
                if loaded_first is None:
                    raise AssertionError("Expected persisted run for initial run")
                assert loaded_first.status == AgentRunStatus.completed
                assert loaded_first.finishedAt is not None
                assert loaded_first.events
                assert loaded_first.events[-1].type == "run_completed"
                assert not (
                    any(event.type == "run_failed" for event in loaded_first.events)
                )
                persisted_outputs = loaded_first.outputs
                assert isinstance(persisted_outputs, dict)
                if not isinstance(persisted_outputs, dict):
                    raise AssertionError("Expected persisted outputs to be a dict")
                assert persisted_outputs.get("finalText") == final_text

                stream_text, delta_count = _collect_stream_text_from_events(
                    loaded_first.events
                )
                assert delta_count == 0
                assert stream_text == ""
                assert not (
                    any(event.type == "stream_chunk" for event in loaded_first.events)
                )
                finalized_text = _extract_finalized_assistant_text(loaded_first.events)
                assert finalized_text is None

    async def test_claude_sonnet_45_tool_call_integration(self) -> None:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=r"^Pydantic serializer warnings:",
                category=UserWarning,
                module=r"pydantic.*",
            )
            apply_warning_filters()
            self._suppress_llm_logs()
            api_key = self._require_anthropic_key()

            async with build_runner_with_local_mcp_session() as (
                runner,
                _mcp_client,
                fixture,
            ):
                fixture.dbe.write_json(
                    fixture.dbe.settings,
                    {"backend": {"completionGuardEnabled": False}},
                )
                llm_config = LLMConfig(
                    id="claude-sonnet-tools",
                    model="claude-sonnet-4-5-20250929",
                    provider="anthropic",
                    api_key_env="ANTHROPIC_API_KEY",
                    other_params={"temperature": 1},
                    mcpServerIds=[SETTA_MCP_SERVER_ID],
                )
                runner.update_config(
                    AllLLMConfigs(
                        configs={llm_config.id: llm_config},
                        mcpServers={
                            SETTA_MCP_SERVER_ID: MCPServerConfig(
                                transport="stdio",
                                command="noop",
                            )
                        },
                        defaultMcpServerIds=[SETTA_MCP_SERVER_ID],
                    )
                )
                runner.update_api_keys({"ANTHROPIC_API_KEY": api_key})

                engine_config = EngineConfig(
                    id="engine-claude-sonnet-tools",
                    name="Claude Sonnet 4.5 Tools",
                    engineType=EngineType.setta_llm,
                    settaLlmConfigId=llm_config.id,
                )
                save_engine_configs(fixture.dbe, [engine_config])

                tool_name = build_namespaced_tool_name(
                    SETTA_MCP_SERVER_ID, "list_mcp_tools"
                )
                profile = AgentProfile(
                    name="Claude Sonnet 4.5 Tools",
                    engineConfigId=engine_config.id,
                    toolAllowlist=[tool_name],
                    systemPrompt=(
                        "Always call the tool list_mcp_tools before responding."
                    ),
                )

                messages = [
                    UserChatMessage(
                        content=[
                            MessageTextContent(
                                text=(
                                    "Call the tool list_mcp_tools and then reply with "
                                    "exactly: TOOL_OK"
                                )
                            )
                        ]
                    )
                ]

                run = runner.start_run(
                    profile,
                    {
                        "messages": [
                            message.model_dump(mode="json") for message in messages
                        ],
                        "allowUnscoped": True,
                    },
                    emit_stream=False,
                    emit_ai_follow=False,
                )
                completed = await runner.wait_for_run(run.id, timeout=120)
                if completed.status != AgentRunStatus.completed:
                    error = None
                    for event in reversed(completed.events):
                        if event.type != "run_failed":
                            continue
                        payload = event.payload
                        if isinstance(payload, dict):
                            error = payload.get("error")
                        break
                    pytest.fail(f"Claude Sonnet 4.5 tool run failed: {error}")

                outputs = completed.outputs
                assert isinstance(outputs, dict)
                if not isinstance(outputs, dict):
                    raise AssertionError("Expected outputs to be a dict")
                final_text = outputs.get("finalText")
                assert isinstance(final_text, str)
                if not isinstance(final_text, str):
                    raise AssertionError("Expected finalText to be a string")
                assert final_text.strip() == "TOOL_OK"

                tool_calls = completed.toolCalls
                assert tool_calls
                assert (
                    any(
                        isinstance(call, dict)
                        and isinstance(call.get("function"), dict)
                        and call["function"].get("name") == tool_name
                        for call in tool_calls
                    )
                )
                tool_messages = [
                    message
                    for message in outputs.get("messages", [])
                    if isinstance(message, dict) and message.get("role") == "tool"
                ]
                assert (
                    any(
                        message.get("tool_name") == tool_name
                        for message in tool_messages
                    )
                )
