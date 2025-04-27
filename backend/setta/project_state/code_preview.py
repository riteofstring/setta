import logging
from abc import ABC

from setta.code_gen.create_runnable_scripts import sanitize_section_path_full_name
from setta.code_gen.export_selected import get_section_path_full_name

logger = logging.getLogger(__name__)


class CodePreview(ABC):
    def __init__(self, sectionId, lsp_writers, websocket_msg_handler, temp_folder):
        self.project_state = None
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.temp_file = None
        self.uri = ""

    async def update(self, project_state, code_details):
        self.project_state = project_state
        for k, v in code_details.items():
            setattr(self, k, v)

        if self.sectionId is None:
            section_path_full_name = self.name
        else:
            section_path_full_name = get_section_path_full_name(
                self.project_state, self.sectionId
            )
        sanitized_full_name = sanitize_section_path_full_name(section_path_full_name)
        filepath = self.temp_folder / f"{sanitized_full_name}.py"
        self.create_or_update_temp_file(filepath, self.code)
        await self.send_document_open_request()

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
        self.uri = await self.lsp_writers.full.send_document_open_request(
            filepath=self.temp_file,
            code=self.code,
        )

    def delete_temp_file(self):
        if self.temp_file and self.temp_file.exists():
            self.temp_file.unlink()
