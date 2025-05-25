import logging
from abc import ABC, abstractmethod
from pathlib import Path

from setta.lsp.managers import LSPWriters
from setta.project_state.utils import convert_path_to_module_path
from setta.utils.constants import CWD
from setta.websockets.msg_handlers.project_manager import WMHProjectManager

logger = logging.getLogger(__name__)


class Code(ABC):
    def __init__(self, temp_folder: Path):
        self.temp_folder = temp_folder
        self.temp_file: Path | None = None

    @abstractmethod
    def get_base_filename(self):
        pass

    @abstractmethod
    def get_extension(self):
        pass

    @abstractmethod
    def get_run_command(self):
        pass

    def update_file(self, code):
        base_filename = self.get_base_filename()
        extension = self.get_extension()
        filepath = self.temp_folder / f"{base_filename}.{extension}"
        self.create_or_update_temp_file(filepath, code)

    def create_temp_file(self, filepath, code):
        logger.debug(f"Creating temporary file {filepath}")
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(code)
        self.temp_file = filepath

    def create_or_update_temp_file(self, filepath, code):
        if self.temp_file != filepath:
            self.delete_temp_file()
            self.create_temp_file(filepath, code)
        if self.temp_file:
            self.temp_file.write_text(code)

    def delete_temp_file(self):
        if self.temp_file and self.temp_file.exists():
            self.temp_file.unlink()

    def write_to_folder(self, code: str, folder: Path) -> Path:
        if self.temp_file:
            full_path = folder / self.temp_file.name
            full_path.write_text(code)
            return full_path
        raise ValueError("self.temp_file is not set")


class PythonCode(Code):
    def __init__(
        self,
        temp_folder: Path,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHProjectManager,
    ):
        super().__init__(temp_folder)
        self.lsp_writer = lsp_writers.full
        self.websocket_msg_handler = websocket_msg_handler
        self.uri: str = ""
        self.diagnostics_callback = None

    async def update_file(self, code):
        super().update_file(code)
        await self.send_document_open_request(code)

    async def send_document_open_request(self, code):
        if self.temp_file and self.temp_file.exists():
            self.uri = await self.lsp_writer.send_document_open_request(
                filepath=self.temp_file,
                code=code,
                diagnostics_callback=self.diagnostics_callback,
            )

    def callback_cleanup(self):
        if self.diagnostics_callback and self.uri:
            self.lsp_writer.remove_diagnostics_response_callback(self.uri)

    @abstractmethod
    def get_base_filename(self):
        pass

    def get_extension(self):
        return "py"

    def get_run_command(self, path: Path):
        path = path.relative_to(CWD)
        module_path = convert_path_to_module_path(path)
        return f"python -m {module_path}"


class BashCode(Code):
    @abstractmethod
    def get_base_filename(self):
        pass

    def get_extension(self):
        return "sh"

    def get_run_command(self, path: Path):
        path = path.relative_to(CWD)
        return f"bash {path}"
