class SectionPerspectiveCodeGenerator:
    def __init__(self, sectionId, lsp_writers, websocket_msg_handler):
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.code_previews = {}
        self.exporter_output = None

    async def text_field_initialize(self, project_state, paramInfoId):
        exporter_obj = export_selected(
            project_state, always_export_args_objs=True, force_include_template_var=True
        )
        var_name = exporter_obj.var_name_mapping[(self.sectionId, paramInfoId, False)]
        projectConfigName = project_state["projectConfig"]["name"]
        code_dict = await generate_final_code_for_sections(
            project_state,
            exporter_obj,
            lsp_writers=self.lsp_writers,
            folder_path=self.lsp_writers["full"].project_code_folder(projectConfigName),
            push_var_name=var_name,
        )
        send_document_open_request_with_diagnostics_with_code_dict(
            self.lsp_writers["full"],
            code_dict,
            exporter_obj,
            projectConfigName,
        )

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
        print("text_field_autocomplete", flush=True)
