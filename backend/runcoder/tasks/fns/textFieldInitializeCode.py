import json

from pydantic import BaseModel

from runcoder.code_gen.export_selected import export_selected, get_code
from runcoder.code_gen.python.generate_code import (
    generate_lines_of_code_without_imports,
)
from runcoder.tasks.task_runner import RunType

from .utils import TaskDefinition, TaskMessage


class TextFieldInitializeCodeContent(BaseModel):
    project: dict
    sectionId: str
    paramInfoId: str | None


class TextFieldInitializeCodeMessage(TaskMessage):
    content: TextFieldInitializeCodeContent


def _textFieldInitializeCode(message: TextFieldInitializeCodeMessage):
    message = message.content
    project = message.project
    exporter_obj = export_selected(project)
    codeJson = exporter_obj.output
    templatedCode = get_code(project)
    sectionId = message.sectionId
    paramInfoId = message.paramInfoId
    push_var_name = exporter_obj.var_name_mapping[(sectionId, paramInfoId, False)]
    lines, var_name_to_line_num = generate_lines_of_code_without_imports(
        codeJson,
        push_var_name=push_var_name,
        force_appear_var_name=push_var_name,
    )
    infoToFullName = {
        tuple(json.loads(k)): v for k, v in project["infoToFullName"].items()
    }
    pushed_var_name_line_num = var_name_to_line_num[push_var_name]
    referencable_var_names = [
        infoToFullName[exporter_obj.var_name_reverse_mapping[v]]
        for v, line_num in var_name_to_line_num.items()
        if line_num < pushed_var_name_line_num
    ]
    print("textFieldInitializeCode", flush=True)
    print(referencable_var_names, flush=True)
    return {
        "output": None,
        "name": "textFieldInitializeCode",
        "cache": [
            lines,
            var_name_to_line_num,
            referencable_var_names,
            templatedCode,
            exporter_obj,
        ],
    }


def write_cache(cache, message: TextFieldInitializeCodeMessage, result):
    if result["cache"] is None:
        return
    project = message.content.project
    sectionId = message.content.sectionId
    cache.setdefault(project["projectConfig"]["id"], {})[sectionId] = result["cache"]


textFieldInitializeCode = TaskDefinition(
    name="textFieldInitializeCode",
    fn=_textFieldInitializeCode,
    write_cache=write_cache,
    run_as=RunType.THREAD,
    is_built_in=True,
)
