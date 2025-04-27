from setta.code_gen.create_runnable_scripts import (
    generate_final_code_for_sections,
)
from setta.code_gen.export_selected import export_selected
from setta.lsp.reader_fns.diagnostics import (
    convert_diagnostic_line_cols_to_positions,
    process_diagnostics,
)
from setta.project_state.code_preview import CodePreview


class ProjectPerspectiveCodePreview(CodePreview):
    async def type_check(self):
        self.uri = await self.lsp_writers["full"].send_document_open_request(
            code_id=self.lsp_code_id, code=self.code, version=self.version
        )

    async def process_diagnostics_response(self, lsp_response, exporter_output):
        params = lsp_response["params"]
        convert_diagnostic_line_cols_to_positions(self.code, params["diagnostics"])
        diagnostics = process_diagnostics(
            params["diagnostics"],
            self.code,
            exporter_output,
            self.ref_template_var_positions,
        )
        content = {
            "projectConfigId": self.project_state["projectConfig"]["id"],
            "codeSectionId": self.sectionId,
            "diagnostics": diagnostics,
        }
        await self.websocket_msg_handler.broadcast_lsp_diagnostics(content)


class ProjectPerspectiveCodeGenerator:
    def __init__(self, lsp_writers, websocket_msg_handler):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.project_state = None
        self.code_previews = {}
        self.exporter_output = None

    async def update(self, project_state):
        self.project_state = project_state
        exporter_obj = export_selected(
            self.project_state,
            always_export_args_objs=False,
            force_include_template_var=True,
        )
        self.exporter_output = exporter_obj.output
        projectConfigName = self.project_state["projectConfig"]["name"]
        code_dict = await generate_final_code_for_sections(
            self.project_state,
            exporter_obj,
            lsp_writers=self.lsp_writers,
            folder_path=self.lsp_writers["full"].project_code_folder(projectConfigName),
        )
        self.code_previews = {
            k: v for k, v in self.code_previews.items() if k in code_dict
        }
        for k, v in code_dict.items():
            if k not in self.code_previews:
                self.code_previews[k] = ProjectPerspectiveCodePreview(
                    k, self.lsp_writers, self.websocket_msg_handler
                )
            self.code_previews[k].update(self.project_state, v)

    async def type_check(self):
        for v in self.code_previews.values():
            await v.type_check()

    def get_code_preview_by_uri(self, uri):
        for code_preview in self.code_previews.values():
            if code_preview.uri == uri:
                return code_preview
        return None

    async def process_diagnostics_response(self, lsp_response):
        params = lsp_response["params"]
        code_preview = self.get_code_preview_by_uri(params["uri"])
        if not code_preview or code_preview.version != params["version"]:
            return
        await code_preview.process_diagnostics_response(
            lsp_response, self.exporter_output
        )
