from typing import Dict, Tuple

from setta.code_gen.export_selected import export_selected
from setta.code_gen.python.generate_code import PythonCodeGenerator, PythonCodeLine
from setta.code_gen.python.position_line_col import position_to_line_col
from setta.project_state.code import GenCode
from setta.project_state.lsp_response_handlers.completion import (
    process_completion_response,
)


class SectionViewGenCode(GenCode):
    def __init__(
        self,
        lsp_writers,
        websocket_msg_handler,
        temp_folder,
        exporter_output,
        code,
        lines,
        output_key,
    ):
        super().__init__(
            lsp_writers, websocket_msg_handler, temp_folder, exporter_output
        )
        self.original_code: str = code
        self.original_lines: Dict[Tuple[str, str | None], PythonCodeLine] = lines
        self.output_key: Tuple[str, str | None] = output_key

    async def text_field_autocomplete(self, messageId, fullText, position):
        code_line = self.original_lines[self.output_key]
        start, end = code_line.value_position
        code = self.original_code[:start] + fullText + self.original_code[end:]
        await self.update_code(code)
        position += start
        line, col = position_to_line_col(code, position)
        response = await self.lsp_writer.send_and_wait(
            self.lsp_writer.send_autocomplete_request(
                filepath=self.temp_file, line=line, character=col, request_id=messageId
            ),
            messageId,
        )
        result = process_completion_response(response, self.code)
        await self.websocket_msg_handler.return_to_requester(result, messageId)


class SectionView:
    def __init__(self, sectionId, lsp_writers, websocket_msg_handler, temp_folder):
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.project_state = None
        self.code_previews = {}
        self.text_field_cache: Dict[str, SectionViewGenCode] = {}

    def update(self, project_state):
        self.project_state = project_state
        self.text_field_cache.clear()

    async def text_field_initialize(self, paramInfoId):
        print("*************text_field_initialize\n\n\n", flush=True)
        exporter_obj = export_selected(self.project_state)
        output_key = exporter_obj.create_output_key(self.sectionId, paramInfoId)
        projectConfigName = self.project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        code_generator = PythonCodeGenerator(self.lsp_writers, project_temp_folder)
        code, lines = code_generator.generate_code(
            exporter_obj.output, force_appear_key=output_key
        )
        gen_code_preview = SectionViewGenCode(
            self.lsp_writers,
            self.websocket_msg_handler,
            project_temp_folder,
            exporter_obj.output,
            code,
            lines,
            output_key,
        )
        await gen_code_preview.update(self.project_state, code)
        self.text_field_cache[paramInfoId] = gen_code_preview

    async def text_field_autocomplete(self, messageId, paramInfoId, fullText, position):
        print("*************text_field_autocomplete\n\n\n", flush=True)
        if paramInfoId not in self.text_field_cache:
            await self.text_field_initialize(paramInfoId)
        cache = self.text_field_cache[paramInfoId]
        await cache.text_field_autocomplete(messageId, fullText, position)

    def delete_temp_files(self):
        for v in self.code_previews.values():
            v.delete_temp_file()

    # if push_var_name:
    #     # TODO: rethink this push_var logic
    #     for v in selected.values():
    #         if (
    #             isinstance(v["value"], dict)
    #             and push_var_name in v["value"]["unusedParams"]
    #         ):
    #             v["value"]["usedParams"].append(push_var_name)
    #             v["dependencies"].append(push_var_name)
    #             v["value"]["unusedParams"].remove(push_var_name)
    #     selected = [{"var_name": k, **v} for k, v in selected.items()]
    #     selected = push_var_deep(selected, push_var_name)
    #     selected = {v.pop("var_name"): v for v in selected}
