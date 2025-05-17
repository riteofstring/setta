from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.project_state.code import (
    GenCode,
    NonGenCode,
)
from setta.project_state.lsp_response_handlers.diagnostics import (
    convert_diagnostic_line_cols_to_positions,
    process_diagnostics,
)


class ProjectViewGenCode(GenCode):
    def __init__(self, lsp_writers, websocket_msg_handler, temp_folder, dep_graph):
        super().__init__(lsp_writers, websocket_msg_handler, temp_folder, dep_graph)
        self.diagnostics_callback = self.process_diagnostics_response

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
            self.dep_graph,
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
        dep_graph = DependencyGraph(self.project_state)
        code_generator = PythonCodeGenerator(dep_graph)
        code, _ = code_generator.generate_code()

        if self.gen_code_preview:
            self.gen_code_preview.callback_cleanup()

        projectConfigName = self.project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        self.gen_code_preview = ProjectViewGenCode(
            self.lsp_writers,
            self.websocket_msg_handler,
            project_temp_folder,
            dep_graph,
        )
        await self.gen_code_preview.update(self.project_state, code)

    async def type_check(self):
        await self.gen_code_preview.type_check()
        # for v in self.code_previews.values():
        #     await v.type_check()

    def delete_temp_files(self):
        for v in self.code_previews.values():
            v.delete_temp_file()

    def get_gen_python_code_path(self):
        if self.gen_code_preview:
            return self.gen_code_preview.get_gen_python_code_path()
        return None
