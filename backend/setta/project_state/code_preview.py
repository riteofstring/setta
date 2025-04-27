from abc import ABC
from pathlib import Path

from setta.code_gen.create_runnable_scripts import sanitize_section_path_full_name
from setta.code_gen.export_selected import get_section_path_full_name


class CodePreview(ABC):
    def __init__(self, sectionId, lsp_writers, websocket_msg_handler):
        self.project_state = None
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.lsp_code_id = ""
        self.uri = ""

    def update(self, project_state, code_details):
        self.project_state = project_state
        for k, v in code_details.items():
            setattr(self, k, v)
        self.update_lsp_code_id()

    def update_lsp_code_id(self):
        if self.sectionId is None:
            section_path_full_name = self.name
        else:
            section_path_full_name = get_section_path_full_name(
                self.project_state, self.sectionId
            )
        sanitized_full_name = sanitize_section_path_full_name(section_path_full_name)

        lsp_code_subfolder = Path(self.project_state["projectConfig"]["name"])
        self.lsp_code_id = str(lsp_code_subfolder / sanitized_full_name)
