from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import export_selected
from setta.code_gen.find_placeholders import tp
from setta.project_state.code_preview import CodePreview
from setta.utils.constants import C


class SectionPerspectiveCodeGenerator:
    def __init__(self, sectionId, lsp_writers, websocket_msg_handler, temp_folder):
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.project_state = None
        self.ev_ref_regex = None
        self.full_name_to_info = {}
        self.info_to_full_name = {}
        self.code_previews = {}
        self.text_field_cache = {}

    def update(self, project_state, ev_ref_regex, full_name_to_info, info_to_full_name):
        self.project_state = project_state
        self.ev_ref_regex = ev_ref_regex
        self.full_name_to_info = full_name_to_info
        self.info_to_full_name = info_to_full_name
        self.text_field_cache.clear()

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
        referencable_var_names = [
            self.info_to_full_name[exporter_obj.var_name_reverse_mapping[v]]
            for v, (startPos, _, _) in var_name_to_decl_position.items()
            if startPos < pushed_var_name_position[0]
        ]

        self.text_field_cache[paramInfoId] = TextFieldCache(
            gen_code_dict=gen_code_dict,
            var_name=var_name,
            referencable_var_names=referencable_var_names,
            generated_var_names=generated_var_names,
            exporter_obj=exporter_obj,
        )

    async def text_field_autocomplete(self, messageId, paramInfoId, fullText, position):
        print("*************text_field_autocomplete\n\n\n", flush=True)
        if paramInfoId not in self.text_field_cache:
            await self.text_field_initialize(paramInfoId)
        self.get_code_and_cursor_position(paramInfoId, fullText)

    def get_code_and_cursor_position(self, paramInfoId, fullText):
        evRefs, var_value, new_positions = self.get_ev_refs_and_process_them(
            paramInfoId, fullText
        )

    def get_ev_refs_and_process_them(self, paramInfoId, fullText):
        candidateEVRefs = self.find_candidate_ev_refs(paramInfoId, fullText)
        print(f"candidateEVRefs {candidateEVRefs}\n\n", flush=True)
        return None, None, None

    def find_candidate_ev_refs(self, paramInfoId, value):
        output = set()
        match = self.ev_ref_regex.search(value)
        while match:
            if ev_ref_does_not_refer_to_self(
                self.full_name_to_info, match.group(0), self.sectionId, paramInfoId
            ):
                output.add((match.group(0), match.start()))

            match = self.ev_ref_regex.search(value, match.start() + 1)

        return list(output)

    def delete_temp_files(self):
        for v in self.code_previews.values():
            v.delete_temp_file()


class TextFieldCache:
    def __init__(
        self,
        gen_code_dict,
        var_name,
        referencable_var_names,
        generated_var_names,
        exporter_obj,
    ):
        self.gen_code_dict = gen_code_dict
        self.var_name = var_name
        self.referencable_var_names = referencable_var_names
        self.generated_var_names = generated_var_names
        self.exporter_obj = exporter_obj


def ev_ref_does_not_refer_to_self(
    full_name_to_info, keyword, section_id, param_info_id
):
    return not (
        (
            full_name_to_info[keyword]["section_id"] == section_id
            and not full_name_to_info[keyword]["param_info_id"]
        )
        or (
            full_name_to_info[keyword]["section_id"] == section_id
            and full_name_to_info[keyword]["param_info_id"] == param_info_id
        )
    )
