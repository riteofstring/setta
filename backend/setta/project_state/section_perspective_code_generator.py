from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import export_selected
from setta.project_state.code_preview import CodePreview


class SectionPerspectiveCodeGenerator:
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
        exporter_obj = export_selected(
            self.project_state,
        )
        # TODO: replace this
        var_name = exporter_obj.var_name_mapping[(self.sectionId, paramInfoId, False)]
        projectConfigName = self.project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        code_dict = await generate_final_code_for_sections(
            self.project_state,
            exporter_obj,
            lsp_writers=self.lsp_writers,
            folder_path=project_temp_folder,
            push_var_name=var_name,
        )
        self.code_previews = {
            k: v for k, v in self.code_previews.items() if k in code_dict
        }
        for k, v in code_dict.items():
            if k not in self.code_previews:
                self.code_previews[k] = CodePreview(
                    k, self.lsp_writers, self.websocket_msg_handler, project_temp_folder
                )
            await self.code_previews[k].update(self.project_state, v)

        gen_code_section_details = exporter_obj.code_gen_template_var_section_details[
            "section"
        ]
        gen_code_dict = code_dict[gen_code_section_details["id"]]

        self.text_field_cache[paramInfoId] = TextFieldCache(
            gen_code_dict=gen_code_dict,
            var_name=var_name,
            exporter_obj=exporter_obj,
        )

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
