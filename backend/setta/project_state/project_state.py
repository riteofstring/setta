from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.project_state.project_code import (
    ProjectGenCode,
)


class ProjectState:
    def __init__(self, lsp_writers, websocket_msg_handler, temp_folder):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.project_state = None
        self.gen_code = None
        self.code = {}

    async def update(self, project_state):
        # with open("project_state.json", "w") as f:
        # json.dump(project_state, f, indent=2)
        self.project_state = project_state
        dep_graph = DependencyGraph(self.project_state)
        code_generator = PythonCodeGenerator(dep_graph)
        code, lines = code_generator.generate_code()

        if self.gen_code:
            self.gen_code.callback_cleanup()

        projectConfigName = self.project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        self.gen_code = ProjectGenCode(
            self.lsp_writers,
            self.websocket_msg_handler,
            project_temp_folder,
            dep_graph,
            code,
            lines,
        )
        await self.gen_code.update(self.project_state, code)

    async def type_check(self):
        await self.gen_code.type_check()
        # for v in self.code.values():
        #     await v.type_check()

    async def text_field_autocomplete(
        self, messageId, sectionId, paramInfoId, fullText, position
    ):
        print("*************text_field_autocomplete\n\n\n", flush=True)
        await self.gen_code.text_field_autocomplete(
            messageId, sectionId, paramInfoId, fullText, position
        )

    async def parameters_request(self, messageId, sectionId, fullText):
        print("parameters_request", flush=True)
        await self.gen_code.parameters_request(messageId, sectionId, fullText)

    def delete_temp_files(self):
        self.gen_code.delete_temp_file()
        for v in self.code.values():
            v.delete_temp_file()

    def get_gen_python_code_path(self):
        if self.gen_code:
            return self.gen_code.get_gen_python_code_path()
        return None
