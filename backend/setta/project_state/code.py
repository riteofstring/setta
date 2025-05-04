import logging
from abc import ABC, abstractmethod

from setta.code_gen.create_runnable_scripts import sanitize_section_path_full_name
from setta.code_gen.export_selected import get_section_path_full_name

logger = logging.getLogger(__name__)


class Code(ABC):
    def __init__(self, lsp_writers, websocket_msg_handler, temp_folder):
        self.project_state = None
        self.lsp_writer = lsp_writers.full
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.temp_file = None
        self.uri = ""
        self.code = ""

    async def update(self, project_state, code):
        self.project_state = project_state
        self.code = code
        base_filename = self.get_base_filename()
        filepath = self.temp_folder / f"{base_filename}.py"
        self.create_or_update_temp_file(filepath, self.code)
        await self.send_document_open_request()

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

    async def send_document_open_request(self):
        self.uri = await self.lsp_writer.send_document_open_request(
            filepath=self.temp_file,
            code=self.code,
        )

    def delete_temp_file(self):
        if self.temp_file and self.temp_file.exists():
            self.temp_file.unlink()


class GenCode(Code):
    def get_base_filename(self):
        return "setta_gen"


class NonGenCode(Code):
    def __init__(self, lsp_writers, websocket_msg_handler, temp_folder, sectionId):
        super().__init__(lsp_writers, websocket_msg_handler, temp_folder)
        self.sectionId = sectionId

    def get_base_filename(self):
        section_path_full_name = get_section_path_full_name(
            self.project_state, self.sectionId
        )
        return sanitize_section_path_full_name(section_path_full_name)
