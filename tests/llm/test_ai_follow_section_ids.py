import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.client import MCPClient
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class AIFollowSectionIdExtractionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.dbe = DBE(Path(self.temp_dir.name))
        self.websocket_manager = WebsocketManager()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.mcp_client = MCPClient("http://localhost")
        self.manager = LLMChatManager(
            self.dbe,
            self.mcp_client,
            self.frontend_sender,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_collects_single_section_id(self) -> None:
        result = self.manager._collect_ai_follow_section_ids(
            [
                {"sectionId": "section-1"},
            ]
        )

        self.assertIsNotNone(result)
        self.assertEqual({str(value) for value in result}, {"section-1"})

    def test_collects_multiple_section_ids_and_dedupes(self) -> None:
        result = self.manager._collect_ai_follow_section_ids(
            [
                {"sectionIds": ["section-1", "section-2", "", 123]},
                {"sectionId": "section-2"},
                {"sectionIds": []},
            ]
        )

        self.assertIsNotNone(result)
        self.assertEqual({str(value) for value in result}, {"section-1", "section-2"})

    def test_empty_section_list_returns_empty_list(self) -> None:
        result = self.manager._collect_ai_follow_section_ids(
            [
                {"sectionIds": []},
            ]
        )

        self.assertEqual(result, [])

    def test_missing_section_ids_returns_none(self) -> None:
        result = self.manager._collect_ai_follow_section_ids(
            [
                {"otherKey": "value"},
            ]
        )

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
