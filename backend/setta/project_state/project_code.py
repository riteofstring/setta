from typing import Dict

from setta.code_gen.dependency_graph import DependencyGraph, GraphKeyType
from setta.code_gen.python.generate_code import PythonCodeLine
from setta.code_gen.python.position_line_col import position_to_line_col
from setta.code_gen.utils import get_section_path_full_name, sanitize_name
from setta.project_state.code import (
    Code,
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


class ProjectGenCode(Code):
    def __init__(
        self,
        lsp_writers,
        websocket_msg_handler,
        temp_folder,
        dep_graph: DependencyGraph,
        code,
        lines,
    ):
        super().__init__(lsp_writers, websocket_msg_handler, temp_folder)
        self.dep_graph = dep_graph
        self.diagnostics_callback = self.process_diagnostics_response
        self.original_code: str = code
        self.original_lines: Dict[GraphKeyType, PythonCodeLine] = lines

    async def insert_code_at_position(self, sectionId, paramInfoId, fullText, position):
        graph_key = self.dep_graph.create_graph_key(sectionId, paramInfoId)
        code_line = self.original_lines[graph_key]
        start, end = code_line.value_position
        code = self.original_code[:start] + fullText + self.original_code[end:]
        await self.update_code(code)
        position += start
        line, col = position_to_line_col(code, position)
        return line, col

    async def text_field_autocomplete(self, messageId, fullText, position):
        line, col = await self.insert_code_at_position(fullText, position)
        response = await self.lsp_writer.send_and_wait(
            self.lsp_writer.send_autocomplete_request(
                filepath=self.temp_file, line=line, character=col, request_id=messageId
            ),
            messageId,
        )
        result = process_completion_response(response, self.code)
        await self.websocket_msg_handler.return_to_requester(result, messageId)

    async def parameters_request(self, messageId, sectionId, fullText):
        fullText = f"{fullText}()"
        line, col = await self.insert_code_at_position(
            sectionId, None, fullText, len(fullText)
        )
        col -= 1  # put cursor inside parentheses
        response = await self.lsp_writer.send_and_wait(
            self.lsp_writer.send_signature_help_request(
                filepath=self.temp_file, line=line, character=col, request_id=messageId
            ),
            messageId,
        )
        result = process_signature_help_response(response)
        await self.websocket_msg_handler.return_to_requester(result, messageId)

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

    def get_base_filename(self):
        return "setta_gen"

    def get_gen_python_code_path(self):
        return self.temp_file


class ProjectNonGenCode(Code):
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
