from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.code_gen.python.position_line_col import position_to_line_col
from setta.code_gen.utils import get_section_path_full_name, sanitize_name
from setta.project_state.code import (
    PythonCode,
)
from setta.project_state.lsp_response_handlers.completion import (
    process_completion_response,
)
from setta.project_state.lsp_response_handlers.diagnostics import (
    convert_diagnostic_line_cols_to_positions,
    process_diagnostics,
)
from setta.project_state.lsp_response_handlers.signatureHelp import (
    process_signature_help_response,
)


class ProjectGenPythonCode(PythonCode):
    def __init__(
        self,
        temp_folder,
        lsp_writers,
        websocket_msg_handler,
        project_state,
        dep_graph: DependencyGraph,
        code_generator: PythonCodeGenerator,
    ):
        super().__init__(temp_folder, lsp_writers, websocket_msg_handler)
        self.project_state = project_state
        self.dep_graph = dep_graph
        self.code_generator = code_generator
        self.diagnostics_callback = self.process_diagnostics_response

    async def update_file(self):
        await super().update_file(self.code_generator.code)

    async def insert_code_at_position(self, sectionId, paramInfoId, fullText, position):
        graph_key = self.dep_graph.create_graph_key(sectionId, paramInfoId)
        start = self.code_generator.change_value(graph_key, fullText)
        await self.update_file()
        if start is None:
            return None
        position += start
        line, col = position_to_line_col(self.code_generator.code, position)
        return line, col

    async def text_field_autocomplete(
        self, messageId, sectionId, paramInfoId, fullText, position
    ):
        line_col = await self.insert_code_at_position(
            sectionId, paramInfoId, fullText, position
        )
        if line_col is None:
            await self.websocket_msg_handler.return_to_requester(None, messageId)
        else:
            line, col = line_col
            response = await self.lsp_writer.send_and_wait(
                self.lsp_writer.send_autocomplete_request(
                    filepath=self.temp_file,
                    line=line,
                    character=col,
                    request_id=messageId,
                ),
                messageId,
            )
            result = process_completion_response(response, self.code_generator.code)
            await self.websocket_msg_handler.return_to_requester(result, messageId)

    async def parameters_request(self, messageId, sectionId, fullText):
        line_col = await self.insert_code_at_position(
            sectionId, None, fullText, len(fullText)
        )
        if line_col is None:
            await self.websocket_msg_handler.return_to_requester(None, messageId)
        else:
            line, col = line_col
            col += 1  # put cursor inside parentheses
            response = await self.lsp_writer.send_and_wait(
                self.lsp_writer.send_signature_help_request(
                    filepath=self.temp_file,
                    line=line,
                    character=col,
                    request_id=messageId,
                ),
                messageId,
            )
            result = process_signature_help_response(response)
            await self.websocket_msg_handler.return_to_requester(result, messageId)

    async def type_check(self):
        await self.send_document_open_request(self.code_generator.code)

    async def process_diagnostics_response(self, lsp_response):
        params = lsp_response["params"]
        if self.lsp_writer.get_latest_version_number(self.uri) != params["version"]:
            return
        convert_diagnostic_line_cols_to_positions(
            self.code_generator.code, params["diagnostics"]
        )
        diagnostics = process_diagnostics(
            params["diagnostics"],
            self.code_generator.code,
            self.dep_graph,
        )
        content = {
            "projectConfigId": self.project_state["projectConfig"]["id"],
            "diagnostics": diagnostics,
            "isGenCode": True,
        }
        await self.websocket_msg_handler.broadcast_lsp_diagnostics(content)

    def get_base_filename(self):
        return "setta_gen"

    def get_gen_python_code_path(self):
        return self.temp_file


class ProjectNonGenCode(PythonCode):
    def __init__(self, lsp_writers, websocket_msg_handler, temp_folder, sectionId):
        super().__init__(lsp_writers, websocket_msg_handler, temp_folder)
        self.sectionId = sectionId

    def get_base_filename(self):
        section_path_full_name = get_section_path_full_name(
            self.project_state, self.sectionId
        )
        return sanitize_name(section_path_full_name)

    async def type_check(self):
        await self.send_document_open_request()

    async def process_diagnostics_response(self, lsp_response):
        # TODO
        pass
