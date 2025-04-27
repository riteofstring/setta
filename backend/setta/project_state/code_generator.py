from pathlib import Path

from setta.code_gen.create_runnable_scripts import (
    generate_final_code_for_sections,
    sanitize_section_path_full_name,
)
from setta.code_gen.export_selected import export_selected, get_section_path_full_name


class ProjectPerspectiveCodePreview:
    def __init__(self, lsp_writers):
        self.lsp_writers = lsp_writers
        self.version = 0
        self.lsp_code_id = ""
        self.uri = ""

    def update(self, project_state, code_dict):
        for k, v in code_dict.items():
            setattr(self, k, v)
        self.update_lsp_code_id(project_state)
        self.version += 1

    def update_lsp_code_id(self, project_state):
        projectConfigName = project_state["projectConfig"]["name"]
        section_path_full_name = get_section_path_full_name(
            project_state, self.sectionId
        )
        sanitized_full_name = sanitize_section_path_full_name(section_path_full_name)
        self.lsp_code_id = str(Path(projectConfigName) / sanitized_full_name)

    async def type_check(self):
        self.uri = await self.lsp_writers["full"].send_document_open_request(
            code_id=self.lsp_code_id, code=self.code, version=self.version
        )


class ProjectPerspectiveCodeGenerator:
    def __init__(self, lsp_writers):
        self.lsp_writers = lsp_writers
        self.code_previews = {}
        self.exporter_output = None

    async def generate_code_previews(self, project_state):
        exporter_obj = export_selected(
            project_state,
            always_export_args_objs=False,
            force_include_template_var=True,
        )
        self.exporter_output = exporter_obj.output
        projectConfigName = project_state["projectConfig"]["name"]
        code_dict = await generate_final_code_for_sections(
            project_state,
            exporter_obj,
            lsp_writers=self.lsp_writers,
            folder_path=self.lsp_writers["full"].project_code_folder(projectConfigName),
        )
        self.code_previews = {k: v for k, v in self.code_previews if k in code_dict}
        for k, v in code_dict.items():
            if k not in self.code_previews:
                self.code_previews[k] = ProjectPerspectiveCodePreview()
            self.code_previews[k].update(project_state, v)

    async def type_check(self):
        for v in self.code_previews.values():
            await v.type_check()


class SectionPerspectiveCodeGenerator:
    def __init__(self, sectionId, lsp_writers):
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
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
