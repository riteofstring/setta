from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import export_selected

from .utils import send_document_open_request_with_diagnostics_with_code_dict


class TypeCheck:
    def __init__(self, lsp_writers):
        self.lsp_writers = lsp_writers

    # this just initializes a document which gets the lsp to send back diagnostics
    async def process_message(self, message):
        project = message["content"]
        exporter_obj = export_selected(
            project, always_export_args_objs=False, force_include_template_var=True
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
