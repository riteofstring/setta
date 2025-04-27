from pathlib import Path

from setta.gen_code.create_runnable_scripts import generate_final_code_for_sections
from setta.gen_code.export_selected import (
    export_selected,
    get_section_path_full_name,
)
from setta.lsp.reader_fns.diagnostics import (
    convert_diagnostic_line_cols_to_positions,
    process_diagnostics,
)


class CodeState:
    def __init__(self, project_state, lsp_writers, websocket_msg_handler):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.state = None
        self.exporter_output = None
        self.code_blocks = {}  # section id to {"code", "ref_template_var_positions", ...}

    async def update(self, project_state):
        self.state = project_state
        self.update_section_path_full_name()

        exporter_obj = export_selected(
            self.state, always_export_args_objs=False, force_include_template_var=True
        )
        self.exporter_output = exporter_obj.output
        old_versions = {k: v["version"] for k, v in self.code_blocks.items()}
        projectConfigName = self.state["projectConfig"]["name"]
        self.code_blocks = await generate_final_code_for_sections(
            self.state,
            exporter_obj,
            lsp_writers=self.lsp_writers,
            folder_path=self.lsp_writers["full"].project_code_folder(projectConfigName),
        )
        for k, v in self.code_blocks.items():
            v["code_id"] = str(Path(projectConfigName) / v["sanitized_full_name"])
            v["version"] = old_versions.get(k, 0) + 1

    def update_section_path_full_name(self):
        sectionPathFullNames = {}
        for s in self.state["sections"].values():
            sectionPathFullNames[s["id"]] = get_section_path_full_name(
                self.state, s["id"]
            )
        self.state["sectionPathFullNames"] = sectionPathFullNames

    async def type_check(self):
        for details in self.code_blocks.values():
            if details["codeLanguage"] != "python":
                continue
            details["uri"] = await self.lsp_writers["full"].send_document_open_request(
                code_id=details["code_id"],
                code=details["code"],
                version=details["version"],
            )

    def get_uri_code_block(self, uri):
        for sectionId, details in self.code_blocks.items():
            if details["uri"] == uri:
                return sectionId, details
        return None, None

    async def process_diagnostics_response(self, lsp_response):
        params = lsp_response["params"]
        sectionId, details = self.get_uri_code_block(params["uri"])
        if not details or details["version"] != params["version"]:
            return
        convert_diagnostic_line_cols_to_positions(
            details["code"], params["diagnostics"]
        )
        diagnostics = process_diagnostics(
            params["diagnostics"],
            details["code"],
            self.exporter_output,
            details["ref_template_var_positions"],
        )
        content = {
            "projectConfigId": self.state["projectConfig"]["id"],
            "codeSectionId": sectionId,
            "diagnostics": diagnostics,
        }

        await self.websocket_msg_handler.broadcast_lsp_diagnostics(content)
