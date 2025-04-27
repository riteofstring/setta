import json
from typing import Optional

from pydantic import BaseModel

from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import export_selected
from setta.code_gen.find_placeholders import tp
from setta.utils.constants import C

from .utils import send_document_open_request_with_diagnostics_with_code_dict


class TextFieldInitializeCodeContent(BaseModel):
    project: dict
    sectionId: str
    paramInfoId: Optional[str]


async def textFieldInitializeCode(message, lsp_writers, code_state):
    message = TextFieldInitializeCodeContent.parse_obj(message["content"])
    project = message.project
    exporter_obj = export_selected(
        project, always_export_args_objs=True, force_include_template_var=True
    )

    var_name = exporter_obj.var_name_mapping[
        (message.sectionId, message.paramInfoId, False)
    ]
    projectConfigName = project["projectConfig"]["name"]
    code_dict = await generate_final_code_for_sections(
        project,
        exporter_obj,
        lsp_writers=lsp_writers,
        folder_path=lsp_writers["full"].project_code_folder(projectConfigName),
        push_var_name=var_name,
    )
    send_document_open_request_with_diagnostics_with_code_dict(
        lsp_writers["full"],
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
