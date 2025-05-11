import logging
from abc import ABC, abstractmethod

from setta.lsp.writer import LanguageServerWriter
from setta.websockets.websocket_msg_handlers import WMHProjectManager

logger = logging.getLogger(__name__)


class Code(ABC):
    def __init__(self, lsp_writers, websocket_msg_handler, temp_folder):
        self.lsp_writer: LanguageServerWriter = lsp_writers.full
        self.websocket_msg_handler: WMHProjectManager = websocket_msg_handler
        self.temp_folder = temp_folder
        self.temp_file = None
        self.uri = ""
        self.diagnostics_callback = None

    async def update_file(self, code):
        base_filename = self.get_base_filename()
        filepath = self.temp_folder / f"{base_filename}.py"
        self.create_or_update_temp_file(filepath, code)
        await self.send_document_open_request(code)

    @abstractmethod
    def get_base_filename(self):
        pass

    def create_temp_file(self, filepath, code):
        logger.debug(f"Creating temporary file {filepath}")
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(code)
        self.temp_file = filepath

    def create_or_update_temp_file(self, filepath, code):
        if self.temp_file != filepath:
            self.delete_temp_file()
            self.create_temp_file(filepath, code)
        self.temp_file.write_text(code)

    async def send_document_open_request(self, code):
        if self.temp_file.exists():
            self.uri = await self.lsp_writer.send_document_open_request(
                filepath=self.temp_file,
                code=code,
                diagnostics_callback=self.diagnostics_callback,
            )

    def delete_temp_file(self):
        if self.temp_file and self.temp_file.exists():
            self.temp_file.unlink()

    def callback_cleanup(self):
        if self.diagnostics_callback and self.uri:
            self.lsp_writer.remove_diagnostics_response_callback(self.uri)
