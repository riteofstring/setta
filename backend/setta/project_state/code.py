import logging
import uuid
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from pathlib import Path

from setta.database.db_objs import DBE
from setta.lsp.managers import LSPWriters
from setta.project_state.utils import convert_path_to_module_path, get_code_extension
from setta.types.section_impls import CodeFileBinding, CodeLanguage
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


class Code(ABC):
    def __init__(self, dbe: DBE, binding: CodeFileBinding):
        self.dbe = dbe
        self.binding = binding

    def get_base_filename(self):
        return self.binding.canonical_path.stem

    @abstractmethod
    def get_extension(self):
        pass

    @abstractmethod
    def get_run_command(self):
        pass

    def update_file(self, code):
        filepath = self.binding.canonical_path
        logger.debug("Writing canonical file %s", filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        self.dbe.write(filepath, code)

    def write_to_folder(self, code: str, folder: Path) -> Path:
        folder.mkdir(parents=True, exist_ok=True)
        target_path = folder / self.binding.canonical_path.name
        self.dbe.write(target_path, code)
        return target_path


class PythonCode(Code):
    def __init__(
        self,
        dbe: DBE,
        binding: CodeFileBinding,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
    ):
        super().__init__(dbe, binding)
        self.lsp_writer = lsp_writers.full
        self.websocket_msg_handler = websocket_msg_handler
        self.uri: str = ""

    async def update_file(self, code):
        super().update_file(code)
        await self.send_document_open_request(code)

    async def send_document_open_request(self, code):
        filepath = self.binding.canonical_path
        if filepath.exists():
            self.uri = await self.lsp_writer.send_document_open_request(
                filepath=filepath,
                code=code,
                diagnostics_callback=self.diagnostics_callback,
            )

    def callback_cleanup(self):
        if self.diagnostics_callback and self.uri:
            self.lsp_writer.remove_diagnostics_response_callback(self.uri)

    def get_extension(self):
        return get_code_extension(CodeLanguage.python)

    def get_run_command(self, path: Path):
        path = normalize_path(path)
        module_path = convert_path_to_module_path(path)
        return f"python -m {module_path}"

    @abstractmethod
    async def diagnostics_callback(self, lsp_response):
        pass

    @asynccontextmanager
    async def temporary_document(self, code: str):
        snapshot_dir = self.binding.snapshot_dir
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        filepath = (
            snapshot_dir
            / f"{self.get_base_filename()}__{uuid.uuid4().hex}.{self.get_extension()}"
        )
        uri: str | None = None
        try:
            self.dbe.write(filepath, code)
            uri = await self.lsp_writer.send_document_open_request(
                filepath=filepath,
                code=code,
            )
            yield filepath
        finally:
            if uri:
                await self.lsp_writer.send_document_close_request(filepath)
            if filepath.exists():
                filepath.unlink()


class BashCode(Code):
    def get_extension(self):
        return get_code_extension(CodeLanguage.bash)

    def get_run_command(self, path: Path):
        path = normalize_path(path)
        return f"bash {path}"
