import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from setta.database.db_objs import DBE
from setta.llm.llm_chat_manager import LLMChatManager
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class _StubMCPClient:
    def __init__(self) -> None:
        self.available_tools = []


class LLMChatManagerRequestOverridesTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self._manager = LLMChatManager(
            dbe=DBE(Path(self._temp_dir.name)),
            mcp_client=_StubMCPClient(),
            websocket_msg_handler=MagicMock(spec=WMHFrontendSender),
        )

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_enables_reasoning_and_responses_bridge_for_openai(self) -> None:
        request = {
            "model": "gpt-5.1",
            "custom_llm_provider": "openai",
        }

        self._manager._apply_request_overrides(request, deep_think=True)

        self.assertEqual(request["reasoning_effort"], "high")
        self.assertEqual(request["model"], "openai/responses/gpt-5.1")

    def test_adds_responses_bridge_when_reasoning_already_enabled(self) -> None:
        request = {
            "model": "gpt-5.1",
            "custom_llm_provider": "openai",
            "reasoning_effort": "medium",
        }

        self._manager._apply_request_overrides(request, deep_think=False)

        self.assertEqual(request["model"], "openai/responses/gpt-5.1")

    def test_skips_bridge_for_non_openai_provider(self) -> None:
        request = {
            "model": "gpt-5.1",
            "custom_llm_provider": "azure",
            "reasoning_effort": "medium",
        }

        self._manager._apply_request_overrides(request, deep_think=False)

        self.assertEqual(request["model"], "gpt-5.1")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
