import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from setta.project_state import project_code


class FakeDBE:
    def write(self, filepath: Path, code: str):
        Path(filepath).write_text(code)


class FakeDependencyGraph:
    def create_graph_key(self, section_id: str, param_info_id: str | None):
        return section_id, param_info_id


class FakeCodeGenerator:
    def __init__(self):
        self.code = ""

    def change_value(self, graph_key, full_text):
        self.code = full_text
        return 0

    def set_gen_code_prefix(self, full_text):
        self.code = full_text

    def set_gen_code_suffix(self, full_text):
        self.code = full_text
        return 0


class FakeWebsocketHandler:
    def __init__(self):
        self.broadcasts = []

    async def broadcast_lsp_diagnostics(self, content):
        self.broadcasts.append(content)


class FakeWriter:
    def __init__(self):
        self.virtual_open_calls: list[dict] = []
        self.file_open_calls: list[dict] = []
        self.autocomplete_calls: list[dict] = []
        self.signature_calls: list[dict] = []
        self.pending_request_ids: list[str] = []
        self.latest_version_numbers: dict = {}
        self.diagnostics_callbacks: dict = {}
        self.response_payload = {"items": []}

    async def send_virtual_document_open_request(
        self, uri: str, code: str, diagnostics_callback=None
    ):
        if diagnostics_callback:
            self.add_diagnostics_response_callback(uri, diagnostics_callback)
        version = self.latest_version_numbers.get(uri, -1) + 1
        self.latest_version_numbers[uri] = version
        self.virtual_open_calls.append({"uri": uri, "code": code, "version": version})
        return uri

    async def send_document_open_request(
        self, filepath: Path, code: str, diagnostics_callback=None
    ):
        uri = Path(filepath).as_uri()
        if diagnostics_callback:
            self.add_diagnostics_response_callback(uri, diagnostics_callback)
        version = self.latest_version_numbers.get(uri, -1) + 1
        self.latest_version_numbers[uri] = version
        self.file_open_calls.append(
            {"filepath": filepath, "uri": uri, "code": code, "version": version}
        )
        return uri

    async def send_autocomplete_request(
        self,
        *,
        line,
        character,
        request_id,
        filepath=None,
        uri=None,
    ):
        self.autocomplete_calls.append(
            {
                "line": line,
                "character": character,
                "request_id": request_id,
                "filepath": filepath,
                "uri": uri,
            }
        )

    async def send_signature_help_request(
        self,
        *,
        line,
        character,
        request_id,
        filepath=None,
        uri=None,
    ):
        self.signature_calls.append(
            {
                "line": line,
                "character": character,
                "request_id": request_id,
                "filepath": filepath,
                "uri": uri,
            }
        )

    async def send_and_wait(self, coroutine, request_id):
        self.pending_request_ids.append(request_id)
        await coroutine
        return self.response_payload

    def get_latest_version_number(self, uri):
        return self.latest_version_numbers.get(uri)

    def add_diagnostics_response_callback(self, uri, callback):
        self.diagnostics_callbacks[uri] = callback

    def remove_diagnostics_response_callback(self, uri):
        self.diagnostics_callbacks.pop(uri, None)


class FakeLSPWriters:
    def __init__(self, writer: FakeWriter):
        self.full = writer


class ProjectGenPythonCodeVirtualDocsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.temp_path = Path(self.temp_dir.name)
        self.dbe = FakeDBE()
        self.dep_graph = FakeDependencyGraph()
        self.code_generator = FakeCodeGenerator()
        self.websocket_handler = FakeWebsocketHandler()

    @patch("setta.project_state.project_code.process_completion_response")
    async def test_virtual_completion_uses_virtual_uri(self, mock_completion):
        mock_completion.return_value = ["mock-completion"]
        writer = FakeWriter()
        lsp_writers = FakeLSPWriters(writer)

        with patch(
            "setta.project_state.project_code.ENABLE_VIRTUAL_COMPLETION_DOCS", True
        ):
            gen_code = project_code.ProjectGenPythonCode(
                self.dbe,
                self.temp_path,
                lsp_writers,
                self.websocket_handler,
                project_config_id="proj-123",
                dep_graph=self.dep_graph,
                code_generator=self.code_generator,
            )

        completions = await gen_code.text_field_completion(
            sectionId="section-1",
            paramInfoId=None,
            fullText="print('hi')",
            position=4,
        )

        self.assertEqual(completions, ["mock-completion"])
        self.assertEqual(len(writer.virtual_open_calls), 1)
        virtual_call = writer.virtual_open_calls[0]
        expected_uri = (
            (self.temp_path / "virtual_docs" / "proj-123" / "gen.py")
            .absolute()
            .as_uri()
        )
        self.assertEqual(virtual_call["uri"], expected_uri)
        self.assertEqual(virtual_call["code"], "print('hi')")
        self.assertEqual(len(writer.autocomplete_calls), 1)
        autocomplete_call = writer.autocomplete_calls[0]
        self.assertIsNone(autocomplete_call["filepath"])
        self.assertEqual(autocomplete_call["uri"], virtual_call["uri"])
        self.assertTrue(gen_code.temp_file is not None and gen_code.temp_file.exists())
        mock_completion.assert_called_once_with(writer.response_payload, gen_code.code)

    @patch("setta.project_state.project_code.process_completion_response")
    async def test_temp_file_flow_persists_when_flag_disabled(self, mock_completion):
        mock_completion.return_value = ["mock-completion"]
        writer = FakeWriter()
        lsp_writers = FakeLSPWriters(writer)

        with patch(
            "setta.project_state.project_code.ENABLE_VIRTUAL_COMPLETION_DOCS", False
        ):
            gen_code = project_code.ProjectGenPythonCode(
                self.dbe,
                self.temp_path,
                lsp_writers,
                self.websocket_handler,
                project_config_id="proj-456",
                dep_graph=self.dep_graph,
                code_generator=self.code_generator,
            )

        completions = await gen_code.text_field_completion(
            sectionId="section-2",
            paramInfoId=None,
            fullText="value = 42",
            position=5,
        )

        self.assertEqual(completions, ["mock-completion"])
        self.assertEqual(writer.virtual_open_calls, [])
        self.assertEqual(len(writer.file_open_calls), 1)
        file_call = writer.file_open_calls[0]
        self.assertTrue(file_call["filepath"].exists())
        self.assertEqual(len(writer.autocomplete_calls), 1)
        autocomplete_call = writer.autocomplete_calls[0]
        self.assertEqual(autocomplete_call["filepath"], file_call["filepath"])
        self.assertIsNone(autocomplete_call["uri"])
        self.assertTrue(gen_code.temp_file is not None and gen_code.temp_file.exists())
        mock_completion.assert_called_once_with(writer.response_payload, gen_code.code)

    @patch("setta.project_state.project_code.process_completion_response")
    async def test_untitled_scheme_when_configured(self, mock_completion):
        mock_completion.return_value = ["mock-completion"]
        writer = FakeWriter()
        lsp_writers = FakeLSPWriters(writer)

        with (
            patch(
                "setta.project_state.project_code.ENABLE_VIRTUAL_COMPLETION_DOCS", True
            ),
            patch(
                "setta.project_state.project_code.VIRTUAL_COMPLETION_SCHEME", "untitled"
            ),
        ):
            # recreate builder function in module scope by reloading?
            gen_code = project_code.ProjectGenPythonCode(
                self.dbe,
                self.temp_path,
                lsp_writers,
                self.websocket_handler,
                project_config_id="proj-789",
                dep_graph=self.dep_graph,
                code_generator=self.code_generator,
            )

        completions = await gen_code.text_field_completion(
            sectionId="section-9",
            paramInfoId=None,
            fullText="data = []",
            position=4,
        )

        self.assertEqual(completions, ["mock-completion"])
        self.assertEqual(len(writer.virtual_open_calls), 1)
        virtual_call = writer.virtual_open_calls[0]
        self.assertEqual(
            virtual_call["uri"],
            "untitled:setta/completion/proj-789/gen.py",
        )
        self.assertIsNone(writer.autocomplete_calls[0]["filepath"])
        self.assertEqual(writer.autocomplete_calls[0]["uri"], virtual_call["uri"])
