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

@contextmanager
def _manager_context() -> Iterator[LLMChatManager]:
    with TemporaryDirectory() as temp_dir:
        dbe = DBE(Path(temp_dir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        mcp_client = MultiMCPClient({})
        manager = LLMChatManager(
            dbe,
            mcp_client,
            frontend_sender,
        )
        yield manager


@contextmanager
def _build_manager_and_chat(
    *,
    other_params: dict[str, object] | None = None,
) -> Iterator[tuple[LLMChatManager, Chat, ID]]:
    with TemporaryDirectory() as temp_dir:
        dbe = DBE(Path(temp_dir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        mcp_client = MultiMCPClient({})
        active_project_config_id = ID("project-uuid")
        manager = LLMChatManager(
            dbe,
            mcp_client,
            frontend_sender,
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
            projectConfigId=None,
            llmConfig=manager.config.configs["provider-one"],
            messages=[
                UserChatMessage(
                    content=[MessageTextContent(text="Hello from the user")]
                )
            ],
        )
        yield manager, chat, active_project_config_id


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
        with _build_manager_and_chat() as (manager, chat, active_project_config_id):
            prompt = manager.system_prompt

            payload = asyncio.run(
                manager._build_llm_request_payload(
                    chat,
                    deep_think=False,
                    active_project_config_id=active_project_config_id,
                )
            )

            self.assertEqual(payload["messages"][0]["role"], "system")
            system_text = payload["messages"][0]["content"][0]["text"]
            self.assertTrue(system_text.startswith(prompt))
            self.assertIn("## Active project config", system_text)
            _, canonical_to_temporary = manager.dbe.read_temporary_id_map()
            if active_project_config_id not in canonical_to_temporary:
                raise AssertionError("Expected project config ID in temporary map")
            temporary_project_id = canonical_to_temporary[active_project_config_id]
            self.assertIn(str(temporary_project_id), system_text)
            self.assertNotIn("## Project summary", system_text)
            self.assertEqual(payload["messages"][1]["role"], "user")
            self.assertEqual(
                payload["messages"][1]["content"][0]["text"],
                "Hello from the user",
            )


class CachePromptingTests(unittest.TestCase):
    def test_cache_prompting_enabled_when_supported(self) -> None:
        with _build_manager_and_chat() as (manager, chat, active_project_config_id):
            with patch(
                "setta.llm.llm_chat_manager.supports_prompt_caching",
                return_value=True,
            ):
                payload = asyncio.run(
                    manager._build_llm_request_payload(
                        chat,
                        deep_think=False,
                        active_project_config_id=active_project_config_id,
                    )
                )

            self.assertEqual(
                payload.get("cache_control_injection_points"),
                [
                    {"location": "message", "role": "system"},
                    {"location": "message", "index": -1},
                ],
            )

    def test_cache_prompting_skipped_without_support(self) -> None:
        with _build_manager_and_chat() as (manager, chat, active_project_config_id):
            with patch(
                "setta.llm.llm_chat_manager.supports_prompt_caching",
                return_value=False,
            ):
                payload = asyncio.run(
                    manager._build_llm_request_payload(
                        chat,
                        deep_think=False,
                        active_project_config_id=active_project_config_id,
                    )
                )

            self.assertNotIn("cache_control_injection_points", payload)

    def test_existing_cache_prompting_configuration_is_preserved(self) -> None:
        with _build_manager_and_chat(
            other_params={
                "cache_control_injection_points": [
                    {"location": "message", "role": "user"}
                ]
            }
        ) as (manager, chat, active_project_config_id):
            with patch(
                "setta.llm.llm_chat_manager.supports_prompt_caching",
                return_value=True,
            ):
                payload = asyncio.run(
                    manager._build_llm_request_payload(
                        chat,
                        deep_think=False,
                        active_project_config_id=active_project_config_id,
                    )
                )

            self.assertEqual(
                payload["cache_control_injection_points"],
                [{"location": "message", "role": "user"}],
            )

    def test_cache_prompting_includes_all_prior_history(self) -> None:
        with _build_manager_and_chat() as (manager, chat, active_project_config_id):
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
                    manager._build_llm_request_payload(
                        chat,
                        deep_think=False,
                        active_project_config_id=active_project_config_id,
                    )
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
