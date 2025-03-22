import json

from pydantic import BaseModel

from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import export_selected
from setta.code_gen.find_placeholders import tp
from setta.utils.constants import C

from .utils import send_document_open_request_with_diagnostics_with_code_dict


class CodeAreaInitializeCodeContent(BaseModel):
    project: dict
    sectionId: str


class CodeAreaInitializeCode:
    def __init__(self, lsp_writers, cache):
        self.lsp_writers = lsp_writers
        self.cache = cache

    async def process_message(self, message):
        message = CodeAreaInitializeCodeContent.parse_obj(message["content"])
        project = message.project
        exporter_obj = export_selected(
            project, always_export_args_objs=True, force_include_template_var=False
        )
        projectConfigName = project["projectConfig"]["name"]
        code_dict = await generate_final_code_for_sections(
            project,
            exporter_obj,
            lsp_writers=self.lsp_writers,
            folder_path=self.lsp_writers["full"].project_code_folder(projectConfigName),
        )
        send_document_open_request_with_diagnostics_with_code_dict(
            self.lsp_writers["full"],
            code_dict,
            exporter_obj,
            projectConfigName,
        )

        referencable_var_names = []
        generated_var_names = []
        if (
            exporter_obj.code_gen_template_var_section_details["section"].get("id")
            == message.sectionId
        ):
            generated_var_names = list(
                code_dict[message.sectionId]["var_name_to_decl_rel_position_dict"][
                    tp(C.SETTA_GENERATED_PYTHON)
                ].keys()
            )
            infoToFullName = {
                tuple(json.loads(k)): v for k, v in project["infoToFullName"].items()
            }
            referencable_var_names = [
                infoToFullName[exporter_obj.var_name_reverse_mapping[v]]
                for v in generated_var_names
            ]

        template_var_replacement_values = {}
        for r in code_dict[message.sectionId]["ref_template_var_positions"][
            "templateVars"
        ]:
            template_var_replacement_values[r["keyword"]] = r["value"]

        self.write_cache(
            message,
            [
                template_var_replacement_values,
                generated_var_names,
                referencable_var_names,
                exporter_obj,
                project["fullNameToInfo"],
                project["fullNameToSectionId"],
            ],
        )

        return True

    @staticmethod
    def get_cache_key(projectConfigId, sectionId):
        return f"codeAreaInitializeCode-{projectConfigId}-{sectionId}"

    def write_cache(self, message, to_cache):
        cache_key = self.get_cache_key(
            message.project["projectConfig"]["id"], message.sectionId
        )
        self.cache[cache_key] = to_cache
