from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import export_selected
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.project_state.code import Code, GenCode


class SectionView:
    def __init__(self, sectionId, lsp_writers, websocket_msg_handler, temp_folder):
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.project_state = None
        self.gen_code_preview = None
        self.code_previews = {}
        self.text_field_cache = {}

    def update(self, project_state):
        self.project_state = project_state
        self.text_field_cache.clear()

    async def text_field_initialize(self, paramInfoId):
        print("*************text_field_initialize\n\n\n", flush=True)
        exporter_obj = export_selected(self.project_state)
        var_name = exporter_obj.var_name_mapping[(self.sectionId, paramInfoId)]
        projectConfigName = self.project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        self.code_generator = PythonCodeGenerator(self.lsp_writers, project_temp_folder)
        code = await self.code_generator.generate_code(exporter_obj.output)
        self.gen_code_preview = GenCode(
            self.lsp_writers, self.websocket_msg_handler, project_temp_folder
        )
        await self.gen_code_preview.update(self.project_state, code)

        # gen_code_section_details = exporter_obj.code_gen_template_var_section_details[
        #     "section"
        # ]
        # gen_code_dict = code_dict[gen_code_section_details["id"]]

        # self.text_field_cache[paramInfoId] = TextFieldCache(
        #     gen_code_dict=gen_code_dict,
        #     var_name=var_name,
        #     exporter_obj=exporter_obj,
        # )

    async def text_field_autocomplete(self, messageId, paramInfoId, fullText, position):
        print("*************text_field_autocomplete\n\n\n", flush=True)
        if paramInfoId not in self.text_field_cache:
            await self.text_field_initialize(paramInfoId)

    def delete_temp_files(self):
        for v in self.code_previews.values():
            v.delete_temp_file()


class TextFieldCache:
    def __init__(
        self,
        gen_code_dict,
        var_name,
        exporter_obj,
    ):
        self.gen_code_dict = gen_code_dict
        self.var_name = var_name
        self.exporter_obj = exporter_obj
