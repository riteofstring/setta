import copy
from setta.gen_code.create_runnable_scripts import generate_final_code_for_sections
from setta.gen_code.export_selected import (
    Exporter,
    export_selected,
    get_section_path_full_name,
)
from setta.utils.utils import replace_null_keys_with_none

from .code_task_fns.utils import (
    send_document_open_request_with_diagnostics_with_code_dict,
)


class CodeState:
    def __init__(self, project_state, lsp_writers):
        self.state = copy.deepcopy(project_state)
        self.state["codeInfoCols"] = replace_null_keys_with_none(self.state["codeInfoCols"])
        self.lsp_writers = lsp_writers
        self.exporter = Exporter(self.state, always_export_args_objs=False, force_include_template_var=True)
        self.update_section_path_full_name()

    def update_section_path_full_name(self):
        sectionPathFullNames = {}
        for s in self.state["sections"].values():
            sectionPathFullNames[s["id"]] = get_section_path_full_name(
                self.state, s["id"]
            )
        self.state["sectionPathFullNames"] = sectionPathFullNames

    async def type_check(self):
        # export_selected(self.state, always_export_args_objs=False, force_include_template_var=True)
        self.exporter.export()
        projectConfigName = self.state["projectConfig"]["name"]
        code_dict = await generate_final_code_for_sections(
            self.state,
            self.exporter,
            lsp_writers=self.lsp_writers,
            folder_path=self.lsp_writers["full"].project_code_folder(projectConfigName),
        )
        send_document_open_request_with_diagnostics_with_code_dict(
            self.lsp_writers["full"],
            code_dict,
            self.exporter,
            projectConfigName,
        )
