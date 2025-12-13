import unittest
from unittest.mock import patch

from litellm.types.utils import Delta
from setta.llm.llm_chat_manager import LLMChatManager, StreamContentEntry
from setta.types.chat import Chat
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.utils.constants import C


def _manager() -> LLMChatManager:
    # Bypass __init__ so we do not need to hydrate configs or DB state
    return object.__new__(LLMChatManager)


class _DummyDBE:
    def __init__(self, canonical_to_temp: dict[ID, ID]):
        self._canonical_to_temp = canonical_to_temp
        self._temporary_to_canonical = {v: k for k, v in canonical_to_temp.items()}

    def read_temporary_id_map(self):
        return self._temporary_to_canonical, self._canonical_to_temp


def _build_manager_and_chat(
    *,
    other_params: dict[str, object] | None = None,
) -> tuple[LLMChatManager, Chat]:
    manager = _manager()
    manager.config = AllLLMConfigs(
        configs={
            "provider-one": LLMConfig(
                id="provider-one",
                model="gpt-4o",
                other_params=other_params,
            ),
        }
    )
    manager.api_keys = {}
    manager._chat_tool_states = {}
    manager.mcp_client = type("StubMCP", (), {"init_tool_definitions": {}})()
    manager.system_prompt = "System prompt stub"

    chat = Chat(
        id=ID("chat-uuid"),
        name="Test Chat",
        projectConfigId=ID("project-uuid"),
        llmConfig=manager.config.configs["provider-one"],
        messages=[
            UserChatMessage(content=[MessageTextContent(text="Hello from the user")])
        ],
    )
    return manager, chat


class StreamEntryFallbackTests(unittest.TestCase):
    def test_primary_thinking_chunk_suppresses_fallback(self) -> None:
        manager = _manager()
        delta = Delta(
            content=[{"type": "thinking", "thinking": "primary"}],
            reasoning_content="fallback",
        )

        entries = manager._collect_stream_entries(delta)

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0], StreamContentEntry("thinking", "primary", None))

    def test_empty_thinking_chunk_allows_reasoning_fallback(self) -> None:
        manager = _manager()
        delta = Delta(
            content=[{"type": "thinking", "thinking": None}],
            reasoning_content="fallback",
        )

        entries = manager._collect_stream_entries(delta)

        self.assertGreaterEqual(len(entries), 1)
        self.assertEqual(entries[0], StreamContentEntry("thinking", "fallback", None))

    def test_provider_specific_thinking_blocks_are_used(self) -> None:
        manager = _manager()
        delta = Delta(
            content=None,
            reasoning_content=None,
            provider_specific_fields={"thinking_blocks": [{"thinking": "details"}]},
        )

        entries = manager._collect_stream_entries(delta)

        self.assertEqual(entries, [StreamContentEntry("thinking", "details", None)])


class ToolArgumentSanitizationTests(unittest.TestCase):
    def test_project_config_id_is_converted_to_temporary_id(self) -> None:
        canonical_to_temp = {
            ID("chat-uuid"): ID("1"),
            ID("project-uuid"): ID("2"),
        }
        manager = _manager()
        manager.dbe = _DummyDBE(canonical_to_temp)

        sanitized = manager._sanitize_tool_arguments(
            {
                C.MCP_PROJECT_CONFIG_ID_ARG_NAME: ID("project-uuid"),
            }
        )

        self.assertEqual(sanitized[C.MCP_PROJECT_CONFIG_ID_ARG_NAME], "2")


class SystemPromptInjectionTests(unittest.TestCase):
    def test_payload_includes_system_prompt_before_chat_history(self) -> None:
        manager, chat = _build_manager_and_chat()
        prompt = manager.system_prompt

        payload = manager._build_llm_request_payload(chat, deep_think=False)

        self.assertEqual(payload["messages"][0]["role"], "system")
        self.assertEqual(
            payload["messages"][0]["content"][0]["text"],
            prompt,
        )
        self.assertEqual(payload["messages"][1]["role"], "user")
        self.assertEqual(
            payload["messages"][1]["content"][0]["text"],
            "Hello from the user",
        )


class CachePromptingTests(unittest.TestCase):
    def test_cache_prompting_enabled_when_supported(self) -> None:
        manager, chat = _build_manager_and_chat()
        with patch(
            "setta.llm.llm_chat_manager.supports_prompt_caching", return_value=True
        ):
            payload = manager._build_llm_request_payload(chat, deep_think=False)

        self.assertEqual(
            payload.get("cache_control_injection_points"),
            [
                {"location": "message", "role": "system"},
                {"location": "message", "index": -1},
            ],
        )

    def test_cache_prompting_skipped_without_support(self) -> None:
        manager, chat = _build_manager_and_chat()
        with patch(
            "setta.llm.llm_chat_manager.supports_prompt_caching", return_value=False
        ):
            payload = manager._build_llm_request_payload(chat, deep_think=False)

        self.assertNotIn("cache_control_injection_points", payload)

    def test_existing_cache_prompting_configuration_is_preserved(self) -> None:
        manager, chat = _build_manager_and_chat(
            other_params={
                "cache_control_injection_points": [
                    {"location": "message", "role": "user"}
                ]
            }
        )
        with patch(
            "setta.llm.llm_chat_manager.supports_prompt_caching", return_value=True
        ):
            payload = manager._build_llm_request_payload(chat, deep_think=False)

        self.assertEqual(
            payload["cache_control_injection_points"],
            [{"location": "message", "role": "user"}],
        )

    def test_cache_prompting_includes_all_prior_history(self) -> None:
        manager, chat = _build_manager_and_chat()
        chat.messages = [
            UserChatMessage(content=[MessageTextContent(text="First question")]),
            AssistantChatMessage(content=[MessageTextContent(text="First reply")]),
            ToolChatMessage(tool_call_id="tool-call-id"),
            UserChatMessage(content=[MessageTextContent(text="Second question")]),
        ]

        with patch(
            "setta.llm.llm_chat_manager.supports_prompt_caching", return_value=True
        ):
            payload = manager._build_llm_request_payload(chat, deep_think=False)

        self.assertEqual(
            payload["cache_control_injection_points"],
            [
                {"location": "message", "role": "system"},
                {"location": "message", "index": -1},
            ],
        )


if __name__ == "__main__":
    unittest.main()
