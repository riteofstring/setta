import json

from pydantic import BaseModel

from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import export_selected
from setta.code_gen.python.generate_code import generate_code_without_imports
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition, send_document_open_request_with_code_dict


class TextFieldInitializeCodeContent(BaseModel):
    project: dict
    sectionId: str
    paramInfoId: str | None


async def _textFieldInitializeCode(message, lsp_writers):
    message = TextFieldInitializeCodeContent.parse_obj(message.content)
    project = message.project
    exporter_obj = export_selected(
        project, always_export_args_objs=True, force_include_template_var=True
    )

    var_name = exporter_obj.var_name_mapping[
        (message.sectionId, message.paramInfoId, False)
    ]
    projectConfigName = project["projectConfig"]["name"]
    code_dict = generate_final_code_for_sections(
        project,
        exporter_obj,
        lsp_writers["full"].project_code_folder(projectConfigName),
    )
    send_document_open_request_with_code_dict(
        lsp_writers, code_dict, exporter_obj, projectConfigName
    )

    # codeJson = exporter_obj.output

    # lines, var_name_to_line_num = generate_lines_of_code_without_imports(
    #     codeJson,
    #     push_var_name=var_name,
    # )
    # infoToFullName = {
    #     tuple(json.loads(k)): v for k, v in project["infoToFullName"].items()
    # }
    # pushed_var_name_line_num = var_name_to_line_num[var_name]
    # referencable_var_names = [
    #     infoToFullName[exporter_obj.var_name_reverse_mapping[v]]
    #     for v, line_num in var_name_to_line_num.items()
    #     if line_num < pushed_var_name_line_num
    # ]
    # print("textFieldInitializeCode", flush=True)
    # print(referencable_var_names, flush=True)

    return {
        "content": None,
        "cache": [
            lines,
            var_name,
            var_name_to_line_num,
            referencable_var_names,
            exporter_obj,
        ],
    }


def get_cache_key(projectConfigId, sectionId, paramInfoId):
    return f"textFieldInitializeCode-{projectConfigId}-{sectionId}-{paramInfoId}"


def write_cache(cache, message, result):
    if result.get("cache") is None:
        return
    message = TextFieldInitializeCodeContent.parse_obj(message.content)
    key = get_cache_key(
        message.project["projectConfig"]["id"], message.sectionId, message.paramInfoId
    )
    cache[key] = result["cache"]


textFieldInitializeCode = TaskDefinition(
    name="textFieldInitializeCode",
    return_message_type="textFieldInitializeCodeReturn",
    fn=_textFieldInitializeCode,
    write_cache=write_cache,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
