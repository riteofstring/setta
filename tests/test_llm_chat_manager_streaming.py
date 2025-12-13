import unittest

from litellm.types.utils import Delta
from setta.llm.llm_chat_manager import LLMChatManager, StreamContentEntry
from setta.types.chat import Chat
from setta.types.chat_messages import MessageTextContent, UserChatMessage
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
    def test_setta_chat_id_is_converted_to_temporary_id(self) -> None:
        canonical_to_temp = {
            ID("chat-uuid"): ID("1"),
            ID("project-uuid"): ID("2"),
        }
        manager = _manager()
        manager.dbe = _DummyDBE(canonical_to_temp)

        sanitized = manager._sanitize_tool_arguments(
            {
                C.MCP_CHAT_ID_ARG_NAME: ID("chat-uuid"),
                C.MCP_PROJECT_CONFIG_ID_ARG_NAME: ID("project-uuid"),
            }
        )

        self.assertEqual(sanitized[C.MCP_CHAT_ID_ARG_NAME], "1")
        self.assertEqual(sanitized[C.MCP_PROJECT_CONFIG_ID_ARG_NAME], "2")


class SystemPromptInjectionTests(unittest.TestCase):
    def test_payload_includes_system_prompt_before_chat_history(self) -> None:
        manager = _manager()
        manager.config = AllLLMConfigs(
            configs={
                "provider-one": LLMConfig(id="provider-one", model="gpt-4o"),
            }
        )
        manager.api_keys = {}
        manager._chat_tool_states = {}
        manager.mcp_client = type("StubMCP", (), {"init_tool_definitions": {}})()
        prompt = "System prompt stub"
        manager.system_prompt = prompt

        chat = Chat(
            id=ID("chat-uuid"),
            name="Test Chat",
            projectConfigId=ID("project-uuid"),
            llmConfig=manager.config.configs["provider-one"],
            messages=[
                UserChatMessage(
                    content=[MessageTextContent(text="Hello from the user")]
                )
            ],
        )

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


if __name__ == "__main__":
    unittest.main()
