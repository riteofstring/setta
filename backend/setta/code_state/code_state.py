import asyncio
from pathlib import Path

from setta.gen_code.create_runnable_scripts import generate_final_code_for_sections
from setta.gen_code.export_selected import (
    export_selected,
    get_section_path_full_name,
)


class CodeState:
    def __init__(self, project_state, lsp_writers):
        self.lsp_writers = lsp_writers
        self.state = None
        self.version = 0
        self.update(project_state)
        self.code_blocks = {}  # section id to {"code", "ref_template_var_positions", ...}

    def update_section_path_full_name(self):
        sectionPathFullNames = {}
        for s in self.state["sections"].values():
            sectionPathFullNames[s["id"]] = get_section_path_full_name(
                self.state, s["id"]
            )
        self.state["sectionPathFullNames"] = sectionPathFullNames

    async def update(self, project_state):
        self.state = project_state
        self.update_section_path_full_name()

        exporter_obj = export_selected(
            self.state, always_export_args_objs=False, force_include_template_var=True
        )
        projectConfigName = self.state["projectConfig"]["name"]
        self.code_blocks = await generate_final_code_for_sections(
            self.state,
            exporter_obj,
            lsp_writers=self.lsp_writers,
            folder_path=self.lsp_writers["full"].project_code_folder(projectConfigName),
        )
        self.version += 1

    async def type_check(self):
        self.send_document_open_request_with_diagnostics_with_code_dict()

    def construct_code_id(self, sectionName):
        projectConfigName = self.state["projectConfig"]["name"]
        return str(Path(projectConfigName) / sectionName)

    def send_document_open_request_with_diagnostics_with_code_dict(
        self,
    ):
        for codeSectionId, details in self.code_blocks.items():
            if details["codeLanguage"] != "python":
                continue
            asyncio.create_task(
                self.send_document_open_request_with_diagnostics(
                    details["code"],
                    details["sanitized_full_name"],
                )
            )

    async def send_document_open_request_with_diagnostics(
        self,
        code,
        sectionName,
    ):
        code_id = self.construct_code_id(sectionName)
        await self.lsp_writers["full"].send_document_open_request(
            code_id=code_id,
            code=code,
            version=self.version,
        )
