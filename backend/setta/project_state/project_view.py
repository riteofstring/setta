from setta.code_gen.export_selected import export_selected
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.lsp.reader_fns.diagnostics import (
    convert_diagnostic_line_cols_to_positions,
    process_diagnostics,
)
from setta.project_state.code import (
    GenCode,
    NonGenCode,
)


class ProjectViewGenCode(GenCode):
    async def type_check(self):
        await self.send_document_open_request()

    async def process_diagnostics_response(self, lsp_response):
        params = lsp_response["params"]
        if self.lsp_writer.get_latest_version_number(self.uri) != params["version"]:
            return
        convert_diagnostic_line_cols_to_positions(self.code, params["diagnostics"])
        diagnostics = process_diagnostics(
            params["diagnostics"],
            self.code,
            self.exporter_output,
        )
        content = {
            "projectConfigId": self.project_state["projectConfig"]["id"],
            "diagnostics": diagnostics,
            "isGenCode": True,
        }
        await self.websocket_msg_handler.broadcast_lsp_diagnostics(content)


class ProjectViewNonGenCode(NonGenCode):
    async def type_check(self):
        await self.send_document_open_request()

    async def process_diagnostics_response(self, lsp_response):
        # TODO
        pass


class ProjectView:
    def __init__(self, lsp_writers, websocket_msg_handler, temp_folder):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.project_state = None
        self.gen_code_preview = None
        self.code_previews = {}
        self.temp_folder = temp_folder

    async def update(self, project_state):
        # with open("project_state.json", "w") as f:
        # json.dump(project_state, f, indent=2)
        self.project_state = project_state
        exporter_obj = export_selected(self.project_state)
        exporter_output = exporter_obj.output
        # print(json.dumps(exporter_output, indent=2), flush=True)
        projectConfigName = self.project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        code_generator = PythonCodeGenerator(self.lsp_writers, project_temp_folder)
        code, _ = code_generator.generate_code(exporter_obj.output)
        self.gen_code_preview = ProjectViewGenCode(
            self.lsp_writers,
            self.websocket_msg_handler,
            project_temp_folder,
            exporter_output,
        )
        await self.gen_code_preview.update(self.project_state, code)

    async def type_check(self):
        for v in self.code_previews.values():
            await v.type_check()

    def delete_temp_files(self):
        for v in self.code_previews.values():
            v.delete_temp_file()

    def get_gen_python_code_path(self):
        if self.gen_code_preview:
            return self.gen_code_preview.get_gen_python_code_path()
        return None
