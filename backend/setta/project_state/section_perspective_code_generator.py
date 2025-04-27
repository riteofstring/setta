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
        self.up_to_date_text_fields = set()

    def update(self, project_state):
        self.project_state = project_state
        self.up_to_date_text_fields = set()

    async def text_field_initialize(self, paramInfoId):
        print("*************text_field_initialize\n\n\n", flush=True)
        exporter_obj = export_selected(
            self.project_state,
            always_export_args_objs=True,
            force_include_template_var=True,
        )
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
        var_name_to_decl_position = gen_code_dict["var_name_to_decl_rel_position_dict"][
            tp(C.SETTA_GENERATED_PYTHON)
        ]
        pushed_var_name_position = var_name_to_decl_position[var_name]
        generated_var_names = list(var_name_to_decl_position.keys())
        infoToFullName = {
            tuple(json.loads(k)): v for k, v in project["infoToFullName"].items()
        }
        referencable_var_names = [
            infoToFullName[exporter_obj.var_name_reverse_mapping[v]]
            for v, (startPos, _, _) in var_name_to_decl_position.items()
            if startPos < pushed_var_name_position[0]
        ]

        code_state.set_state(
            message.project["projectConfig"]["id"],
            message.sectionId,
            message.paramInfoId,
            [
                gen_code_dict,
                var_name,
                referencable_var_names,
                generated_var_names,
                exporter_obj,
                project["fullNameToInfo"],
            ],
        )

    async def text_field_autocomplete(self, messageId, paramInfoId, fullText, position):
        print("*************text_field_autocomplete\n\n\n", flush=True)
        if paramInfoId not in self.up_to_date_text_fields:
            self.text_field_initialize(paramInfoId)

    def delete_temp_files(self):
        for v in self.code_previews.values():
            v.delete_temp_file()
