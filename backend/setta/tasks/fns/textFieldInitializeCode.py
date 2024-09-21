import json

from pydantic import BaseModel

from setta.code_gen.export_selected import (
    export_selected,
    get_first_section_code_that_needs_generated_python,
)
from setta.code_gen.python.generate_code import (
    generate_lines_of_code_without_imports,
    maybe_prepend_with_imports_and_replace_templated_code,
)
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition


class TextFieldInitializeCodeContent(BaseModel):
    project: dict
    sectionId: str
    paramInfoId: str | None


async def _textFieldInitializeCode(message):
    message = TextFieldInitializeCodeContent.parse_obj(message.content)
    project = message.project
    exporter_obj = export_selected(project, always_export_args_objs=True)
    codeJson = exporter_obj.output
    templatedCode = get_first_section_code_that_needs_generated_python(project)
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

    code, _ = maybe_prepend_with_imports_and_replace_templated_code(
        lines,
        templatedCode,
        push_var_name,
        var_name_to_line_num,
    )

    print("code\n", code, flush=True)

    return {
        "content": None,
        "cache": [
            lines,
            var_name_to_line_num,
            referencable_var_names,
            templatedCode,
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
    run_as=RunType.THREAD,
)
