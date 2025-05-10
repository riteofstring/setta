from dataclasses import dataclass
from typing import Dict, Tuple


from setta.code_gen.export_selected import export_selected
from setta.code_gen.python.generate_code import PythonCodeGenerator, PythonCodeLine
from setta.project_state.code import GenCode


class SectionView:
    def __init__(self, sectionId, lsp_writers, websocket_msg_handler, temp_folder):
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.project_state = None
        self.code_previews = {}
        self.text_field_cache = {}

    def update(self, project_state):
        self.project_state = project_state
        self.text_field_cache.clear()

    async def text_field_initialize(self, paramInfoId):
        print("*************text_field_initialize\n\n\n", flush=True)
        exporter_obj = export_selected(self.project_state)
        force_appear_key = exporter_obj.create_output_key(self.sectionId, paramInfoId)
        projectConfigName = self.project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        code_generator = PythonCodeGenerator(self.lsp_writers, project_temp_folder)
        code, lines = code_generator.generate_code(
            exporter_obj.output, force_appear_key
        )
        gen_code_preview = GenCode(
            self.lsp_writers, self.websocket_msg_handler, project_temp_folder
        )
        await gen_code_preview.update(self.project_state, code)
        self.text_field_cache[paramInfoId] = TextFieldCache(code, lines)

    async def text_field_autocomplete(self, messageId, paramInfoId, fullText, position):
        print("*************text_field_autocomplete\n\n\n", flush=True)
        if paramInfoId not in self.text_field_cache:
            await self.text_field_initialize(paramInfoId)
        cache = self.text_field_cache[paramInfoId]
        print(cache.lines)

    def delete_temp_files(self):
        for v in self.code_previews.values():
            v.delete_temp_file()


@dataclass
class TextFieldCache:
    code: str
    lines: Dict[Tuple[str, str | None], PythonCodeLine]

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
