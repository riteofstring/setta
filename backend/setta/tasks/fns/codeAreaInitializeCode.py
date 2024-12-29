import json

from pydantic import BaseModel

from setta.code_gen.export_selected import (
    export_selected,
    get_gen_code_template_var,
    get_section_code,
    get_selected_section_variant,
)
from setta.code_gen.python.generate_code import generate_code
from setta.tasks.task_runner import RunType
from setta.utils.utils import replace_at_positions

from .utils import TaskDefinition


class CodeAreaInitializeCodeContent(BaseModel):
    project: dict
    sectionId: str


async def _codeAreaInitializeCode(message):
    message = CodeAreaInitializeCodeContent.parse_obj(message.content)
    project = message.project
    code = get_section_code(project, message.sectionId)
    codeJson = None
    gen_code = None
    referencable_var_names = None
    exporter_obj = None
    generated_var_names = set()
    matching_template_var = get_gen_code_template_var(
        get_selected_section_variant(project, message.sectionId)["templateVars"]
    )
    if matching_template_var is not None:
        print("NEEDS GENERATED CODE", flush=True)
        exporter_obj = export_selected(project, always_export_args_objs=True)
        codeJson = exporter_obj.output
        gen_code, var_name_to_line_num = generate_code(
            codeJson,
            code,
            replace_templated_code=False,
        )
        generated_var_names = var_name_to_line_num.keys()
        infoToFullName = {
            tuple(json.loads(k)): v for k, v in project["infoToFullName"].items()
        }
        referencable_var_names = [
            infoToFullName[exporter_obj.var_name_reverse_mapping[v]]
            for v in generated_var_names
        ]

        code = replace_at_positions(
            code,
            [
                (
                    matching_template_var["startPos"],
                    matching_template_var["keyword"],
                    gen_code,
                )
            ],
        )

    # print("gen_code", gen_code, flush=True)
    # print("var_name_to_line_num", var_name_to_line_num, flush=True)
    # print("referencable_var_names", referencable_var_names, flush=True)

    print("code", code, flush=True)

    return {
        "content": True,
        "cache": [
            gen_code,
            generated_var_names,
            referencable_var_names,
            exporter_obj,
        ],
    }


def get_cache_key(projectConfigId, sectionId):
    return f"codeAreaInitializeCode-{projectConfigId}-{sectionId}"


def write_cache(cache, message, result):
    print("writing to cache", cache)
    if result.get("cache") is None:
        return
    message = CodeAreaInitializeCodeContent.parse_obj(message.content)
    cache[
        get_cache_key(message.project["projectConfig"]["id"], message.sectionId)
    ] = result["cache"]
    print("cache", cache)


codeAreaInitializeCode = TaskDefinition(
    name="codeAreaInitializeCode",
    return_message_type="codeAreaInitializeCodeReturn",
    fn=_codeAreaInitializeCode,
    write_cache=write_cache,
    run_as=RunType.NONE,
)
