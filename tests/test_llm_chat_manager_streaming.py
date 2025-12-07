import unittest

from litellm.types.utils import Delta

from backend.setta.llm.llm_chat_manager import LLMChatManager, StreamContentEntry


def _manager() -> LLMChatManager:
    # Bypass __init__ so we do not need to hydrate configs or DB state
    return object.__new__(LLMChatManager)


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


if __name__ == "__main__":
    unittest.main()
