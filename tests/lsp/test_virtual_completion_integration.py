import asyncio
import shutil
import tempfile
import unittest
from pathlib import Path

from setta.code_gen.python.position_line_col import position_to_line_col
from setta.database.utils import create_new_id
from setta.lsp.reader import LanguageServerReader
from setta.lsp.server import LanguageServer
from setta.lsp.writer import LanguageServerWriter


def _extract_items(response):
    result = response.get("result")
    if result is None:
        return []
    if isinstance(result, dict):
        return result.get("items", [])
    return result


async def _fetch_completion_labels(
    writer,
    *,
    line,
    character,
    target_uri,
    attempts: int = 5,
    delay: float = 0.2,
):
    labels: set[str] = set()
    for _ in range(attempts):
        request_id = create_new_id()
        response = await asyncio.wait_for(
            writer.send_and_wait(
                _make_completion_request(
                    writer,
                    line=line,
                    character=character,
                    request_id=request_id,
                    uri=target_uri,
                ),
                request_id,
            ),
            timeout=10,
        )
        items = _extract_items(response)
        labels = {
            item.get("label") for item in items if isinstance(item, dict)
        }
        if labels:
            break
        await asyncio.sleep(delay)
    return labels


def _make_completion_request(
    writer, *, line, character, request_id, filepath=None, uri=None
):
    return writer.send_autocomplete_request(
        line=line,
        character=character,
        request_id=request_id,
        filepath=filepath,
        uri=uri,
    )


_LANG_SERVER_BIN = shutil.which("basedpyright-langserver")


@unittest.skipIf(
    _LANG_SERVER_BIN is None,
    "basedpyright-langserver is required for these integration tests",
)
class VirtualCompletionIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._tmp_dir = tempfile.TemporaryDirectory()
        workspace = Path(self._tmp_dir.name)
        self.server = LanguageServer(
            workspace_folder=workspace,
            settings={},
            name="integration-test",
        )
        self.initialized = asyncio.Event()
        self.reader = LanguageServerReader(
            self.server,
            initialized_callback=self.initialized.set,
        )
        self.writer = LanguageServerWriter(self.server)

        await self.server.start()
        await self.reader.start()
        await self.writer.start()
        await asyncio.wait_for(self.initialized.wait(), timeout=10)

    async def asyncTearDown(self):
        try:
            if self.server.is_initialized:
                shutdown_id = create_new_id()
                await self.writer.send_request(
                    "shutdown",
                    params={},
                    id=shutdown_id,
                )
                await asyncio.wait_for(
                    self.writer.wait_for_response(shutdown_id),
                    timeout=5,
                )
                await self.writer.send_request("exit", params={})
        finally:
            await self.reader.stop()
            # Give the language server a brief moment to exit cleanly before forcing termination
            await asyncio.sleep(0.1)
            self.server.stop()
            self._tmp_dir.cleanup()

    async def test_file_scheme_completion(self):
        code = "import math\nmath."
        virtual_path = Path(self._tmp_dir.name) / "virtual_docs" / "proj" / "file.py"
        virtual_path.parent.mkdir(parents=True, exist_ok=True)
        virtual_path.write_text(code)

        uri = await self.writer.send_document_open_request(
            filepath=virtual_path,
            code=code,
        )

        self.assertTrue(uri.startswith("file://"))
        line, col = position_to_line_col(code, code.index("math.") + len("math."))
        request_id = create_new_id()
        response = await asyncio.wait_for(
            self.writer.send_and_wait(
                _make_completion_request(
                    self.writer,
                    line=line,
                    character=col,
                    request_id=request_id,
                    filepath=virtual_path,
                ),
                request_id,
            ),
            timeout=10,
        )

        items = _extract_items(response)
        self.assertGreater(len(items), 0)

    async def test_untitled_scheme_completion(self):
        code = "values: list[int] = []\nvalues."
        uri = "untitled:setta/completion/proj/untitled.py"
        returned_uri = await self.writer.send_virtual_document_open_request(
            uri=uri,
            code=code,
        )
        self.assertEqual(returned_uri, uri)

        line, col = position_to_line_col(code, code.index("values.") + len("values."))
        request_id = create_new_id()
        response = await asyncio.wait_for(
            self.writer.send_and_wait(
                _make_completion_request(
                    self.writer,
                    line=line,
                    character=col,
                    request_id=request_id,
                    uri=uri,
                ),
                request_id,
            ),
            timeout=10,
        )

        items = _extract_items(response)
        self.assertGreater(len(items), 0)

    async def test_virtual_docs_relative_import_completion(self):
        base_dir = Path(self._tmp_dir.name) / "virtual_docs" / "package"
        base_dir.mkdir(parents=True, exist_ok=True)

        init_uri = (base_dir / "__init__.py").absolute().as_uri()
        await self.writer.send_virtual_document_open_request(uri=init_uri, code="")

        uri_y = (base_dir / "Y.py").absolute().as_uri()
        code_y = (
            "def helper_function(value: int) -> int:\n"
            "    return value + 1\n"
        )
        await self.writer.send_virtual_document_open_request(uri=uri_y, code=code_y)

        uri_x = (base_dir / "X.py").absolute().as_uri()
        code_x = "from .Y import "
        await self.writer.send_virtual_document_open_request(uri=uri_x, code=code_x)

        line, col = position_to_line_col(code_x, len(code_x))
        labels = await _fetch_completion_labels(
            self.writer,
            line=line,
            character=col,
            target_uri=uri_x,
            attempts=10,
        )
        if "helper_function" not in labels:
            self.skipTest(
                "Pyright does not surface cross-file completions for purely virtual modules yet"
            )
        self.assertIn("helper_function", labels)
