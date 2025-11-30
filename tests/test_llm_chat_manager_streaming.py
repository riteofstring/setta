import unittest

from backend.setta.llm.llm_chat_manager import LLMChatManager, StreamContentEntry


class _DummyDelta:
    def __init__(
        self,
        *,
        content=None,
        reasoning_content=None,
        thinking_blocks=None,
        provider_specific_fields=None,
    ) -> None:
        self.content = content
        self.reasoning_content = reasoning_content
        self.thinking_blocks = thinking_blocks
        self.provider_specific_fields = provider_specific_fields


def _manager() -> LLMChatManager:
    # Bypass __init__ so we do not need to hydrate configs or DB state
    return object.__new__(LLMChatManager)


class StreamEntryFallbackTests(unittest.TestCase):
    def test_primary_thinking_chunk_suppresses_fallback(self) -> None:
        manager = _manager()
        delta = _DummyDelta(
            content=[{"type": "thinking", "thinking": "primary"}],
            reasoning_content="fallback",
        )

        entries = list(manager._stream_entries_with_fallback(delta))

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0], StreamContentEntry("thinking", "primary", None))

    def test_empty_thinking_chunk_allows_reasoning_fallback(self) -> None:
        manager = _manager()
        delta = _DummyDelta(
            content=[{"type": "thinking", "thinking": None}],
            reasoning_content="fallback",
        )

        entries = list(manager._stream_entries_with_fallback(delta))

        self.assertGreaterEqual(len(entries), 1)
        self.assertEqual(entries[0], StreamContentEntry("thinking", "fallback", None))

    def test_provider_specific_thinking_blocks_are_used(self) -> None:
        manager = _manager()
        provider_specific = type("ProviderFields", (), {"thinking_blocks": [{"thinking": "details"}]})
        delta = _DummyDelta(
            content=None,
            reasoning_content=None,
            provider_specific_fields=provider_specific(),
        )

        entries = list(manager._stream_entries_with_fallback(delta))

        self.assertEqual(entries, [StreamContentEntry("thinking", "details", None)])


if __name__ == "__main__":
    unittest.main()
