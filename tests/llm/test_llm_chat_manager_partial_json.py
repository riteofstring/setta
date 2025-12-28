import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.client import MultiMCPClient
from setta.types.id import ID
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.project_summary import build_project_summary_switcher


class LLMChatManagerPartialJsonTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.dbe = DBE(Path(self.temp_dir.name))
        self.websocket_manager = WebsocketManager()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.mcp_client = MultiMCPClient({})
        project_manager_switcher = build_project_summary_switcher(ID("project-1"))
        self.manager = LLMChatManager(
            self.dbe,
            self.mcp_client,
            self.frontend_sender,
            project_manager_switcher,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_extract_ids_from_arrays_and_object_keys(self) -> None:
        buffer = (
            '{"sectionId":"temp-1","sectionIds":["temp-2","temp-3"],'
            '"sectionsById":{"temp-4":true,"temp-5":false}}'
        )
        tokens = self.manager._scan_partial_json_strings(buffer)
        ids_by_type = self.manager._extract_stream_ids_by_type_from_tokens(
            tokens,
            {"section": ["sectionId", "sectionIds", "sectionsById"]},
        )
        self.assertIn("section", ids_by_type)
        self.assertEqual(
            {
                ID("temp-1"),
                ID("temp-2"),
                ID("temp-3"),
                ID("temp-4"),
                ID("temp-5"),
            },
            ids_by_type["section"],
        )

    def test_extract_preview_value_from_partial_string(self) -> None:
        buffer = '{"code":"print('
        tokens = self.manager._scan_partial_json_strings(buffer)
        preview = self.manager._extract_preview_value_from_tokens(tokens, "code")
        self.assertEqual("print(", preview)

    def test_extract_preview_value_handles_escapes(self) -> None:
        buffer = '{"code":"line1\\nline2\\u003a"}'
        tokens = self.manager._scan_partial_json_strings(buffer)
        preview = self.manager._extract_preview_value_from_tokens(tokens, "code")
        self.assertEqual("line1\nline2:", preview)

    def test_preview_value_uses_latest_token(self) -> None:
        buffer = '{"code":"first","code":"second"}'
        tokens = self.manager._scan_partial_json_strings(buffer)
        preview = self.manager._extract_preview_value_from_tokens(tokens, "code")
        self.assertEqual("second", preview)


if __name__ == "__main__":
    unittest.main()
