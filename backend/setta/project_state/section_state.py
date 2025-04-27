from pathlib import Path

from setta.code_gen.create_runnable_scripts import sanitize_section_path_full_name
from setta.code_gen.export_selected import get_section_path_full_name


class SectionState:
    def __init__(self, sectionId, lsp_writers):
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.sanitized_full_name = ""
        self.lsp_code_id = ""
        self.is_code_block = False
        self.uri = None
        self.version = 0

    async def type_check(self):
        if not self.is_code_block or self.codeLanguage != "python":
            return
        self.uri = await self.lsp_writers["full"].send_document_open_request(
            code_id=self.lsp_code_id, code=self.code, version=self.version
        )

    def text_field_autocomplete(self):
        print("text_field_autocomplete", flush=True)

    def update(self, project_state):
        self.update_section_path_full_name(project_state)
        self.update_lsp_code_id(project_state)
        self.version += 1

    def update_section_path_full_name(self, project_state):
        section_path_full_name = get_section_path_full_name(
            project_state, self.sectionId
        )
        self.sanitized_full_name = sanitize_section_path_full_name(
            section_path_full_name
        )

    def update_lsp_code_id(self, project_state):
        projectConfigName = project_state["projectConfig"]["name"]
        self.lsp_code_id = str(Path(projectConfigName) / self.sanitized_full_name)

    def update_with_code_dict(self, code_dict):
        for k, v in code_dict.items():
            setattr(self, k, v)
        self.is_code_block = True
