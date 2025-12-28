import asyncio
import unittest
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from litellm.types.utils import Delta
from setta.database.db_objs import DBE
from setta.llm.llm_chat_manager import LLMChatManager, StreamContentEntry
from setta.mcp.client import MultiMCPClient
from setta.types.chat import Chat
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.project_summary import build_project_summary_switcher


@contextmanager
def _manager_context() -> Iterator[LLMChatManager]:
    with TemporaryDirectory() as temp_dir:
        dbe = DBE(Path(temp_dir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        mcp_client = MultiMCPClient({})
        project_manager_switcher = build_project_summary_switcher(ID("project-uuid"))
        manager = LLMChatManager(
            dbe,
            mcp_client,
            frontend_sender,
            project_manager_switcher,
        )
        yield manager


@contextmanager
def _build_manager_and_chat(
    *,
    other_params: dict[str, object] | None = None,
) -> Iterator[tuple[LLMChatManager, Chat]]:
    with TemporaryDirectory() as temp_dir:
        dbe = DBE(Path(temp_dir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        mcp_client = MultiMCPClient({})
        project_config_id = ID("project-uuid")
        project_manager_switcher = build_project_summary_switcher(project_config_id)
        manager = LLMChatManager(
            dbe,
            mcp_client,
            frontend_sender,
            project_manager_switcher,
        )
        manager.config = AllLLMConfigs(
            configs={
                "provider-one": LLMConfig(
                    id="provider-one",
                    model="gpt-4o",
                    other_params=other_params,
                ),
            }
        )
        manager.system_prompt = "System prompt stub"

        chat = Chat(
            id=ID("chat-uuid"),
            name="Test Chat",
            projectConfigId=project_config_id,
            llmConfig=manager.config.configs["provider-one"],
            messages=[
                UserChatMessage(
                    content=[MessageTextContent(text="Hello from the user")]
                )
            ],
        )
        yield manager, chat


class StreamEntryFallbackTests(unittest.TestCase):
    def test_primary_thinking_chunk_suppresses_fallback(self) -> None:
        with _manager_context() as manager:
            delta = Delta(
                content=[{"type": "thinking", "thinking": "primary"}],
                reasoning_content="fallback",
            )

            entries = manager._collect_stream_entries(delta)

            self.assertEqual(len(entries), 1)
            self.assertEqual(
                entries[0], StreamContentEntry("thinking", "primary", None)
            )

    def test_empty_thinking_chunk_allows_reasoning_fallback(self) -> None:
        with _manager_context() as manager:
            delta = Delta(
                content=[{"type": "thinking", "thinking": None}],
                reasoning_content="fallback",
            )

            entries = manager._collect_stream_entries(delta)

            self.assertGreaterEqual(len(entries), 1)
            self.assertEqual(
                entries[0], StreamContentEntry("thinking", "fallback", None)
            )

    def test_provider_specific_thinking_blocks_are_used(self) -> None:
        with _manager_context() as manager:
            delta = Delta(
                content=None,
                reasoning_content=None,
                provider_specific_fields={"thinking_blocks": [{"thinking": "details"}]},
            )

            entries = manager._collect_stream_entries(delta)

            self.assertEqual(
                entries, [StreamContentEntry("thinking", "details", None)]
            )


class SystemPromptInjectionTests(unittest.TestCase):
    def test_payload_includes_system_prompt_before_chat_history(self) -> None:
        with _build_manager_and_chat() as (manager, chat):
            prompt = manager.system_prompt

            payload = asyncio.run(
                manager._build_llm_request_payload(chat, deep_think=False)
            )

            self.assertEqual(payload["messages"][0]["role"], "system")
            system_text = payload["messages"][0]["content"][0]["text"]
            self.assertTrue(system_text.startswith(prompt))
            self.assertIn("## Active project config", system_text)
            self.assertIn("## Project summary", system_text)
            self.assertEqual(payload["messages"][1]["role"], "user")
            self.assertEqual(
                payload["messages"][1]["content"][0]["text"],
                "Hello from the user",
            )


class CachePromptingTests(unittest.TestCase):
    def test_cache_prompting_enabled_when_supported(self) -> None:
        with _build_manager_and_chat() as (manager, chat):
            with patch(
                "setta.llm.llm_chat_manager.supports_prompt_caching",
                return_value=True,
            ):
                payload = asyncio.run(
                    manager._build_llm_request_payload(chat, deep_think=False)
                )

            self.assertEqual(
                payload.get("cache_control_injection_points"),
                [
                    {"location": "message", "role": "system"},
                    {"location": "message", "index": -1},
                ],
            )

    def test_cache_prompting_skipped_without_support(self) -> None:
        with _build_manager_and_chat() as (manager, chat):
            with patch(
                "setta.llm.llm_chat_manager.supports_prompt_caching",
                return_value=False,
            ):
                payload = asyncio.run(
                    manager._build_llm_request_payload(chat, deep_think=False)
                )

            self.assertNotIn("cache_control_injection_points", payload)

    def test_existing_cache_prompting_configuration_is_preserved(self) -> None:
        with _build_manager_and_chat(
            other_params={
                "cache_control_injection_points": [
                    {"location": "message", "role": "user"}
                ]
            }
        ) as (manager, chat):
            with patch(
                "setta.llm.llm_chat_manager.supports_prompt_caching",
                return_value=True,
            ):
                payload = asyncio.run(
                    manager._build_llm_request_payload(chat, deep_think=False)
                )

            self.assertEqual(
                payload["cache_control_injection_points"],
                [{"location": "message", "role": "user"}],
            )

    def test_cache_prompting_includes_all_prior_history(self) -> None:
        with _build_manager_and_chat() as (manager, chat):
            chat.messages = [
                UserChatMessage(content=[MessageTextContent(text="First question")]),
                AssistantChatMessage(content=[MessageTextContent(text="First reply")]),
                ToolChatMessage(tool_call_id="tool-call-id"),
                UserChatMessage(content=[MessageTextContent(text="Second question")]),
            ]

            with patch(
                "setta.llm.llm_chat_manager.supports_prompt_caching",
                return_value=True,
            ):
                payload = asyncio.run(
                    manager._build_llm_request_payload(chat, deep_think=False)
                )

            self.assertEqual(
                payload["cache_control_injection_points"],
                [
                    {"location": "message", "role": "system"},
                    {"location": "message", "index": -1},
                ],
            )


if __name__ == "__main__":
    unittest.main()
