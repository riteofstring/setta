import json

from pydantic import BaseModel

from setta.code_gen.export_selected import export_selected, get_selected_section_variant
from setta.code_gen.find_placeholders import needs_generated_python
from setta.code_gen.python.generate_code import generate_code, replace_keywords
from setta.tasks.task_runner import RunType
from setta.utils.constants import USER_SETTINGS, C

from .utils import TaskDefinition


class CodeAreaInitializeCodeContent(BaseModel):
    project: dict
    sectionId: str


async def _codeAreaInitializeCode(message, lsp_writer):
    message = CodeAreaInitializeCodeContent.parse_obj(message.content)
    project = message.project
    code = get_selected_section_variant(project, message.sectionId)["code"]
    codeJson = None
    gen_code = None
    referencable_var_names = None
    exporter_obj = None
    generated_var_names = set()
    if needs_generated_python(code):
        print("NEEDS GENERATED CODE", flush=True)
        exporter_obj = export_selected(project)
        codeJson = exporter_obj.output
        gen_code, var_name_to_line_num = generate_code(
            codeJson,
            code,
            replace_templated_code=False,
            inferImports=USER_SETTINGS["inferImports"],
        )
        generated_var_names = var_name_to_line_num.keys()
        infoToFullName = {
            tuple(json.loads(k)): v for k, v in project["infoToFullName"].items()
        }
        referencable_var_names = [
            infoToFullName[exporter_obj.var_name_reverse_mapping[v]]
            for v in generated_var_names
        ]

    # print("gen_code", gen_code, flush=True)
    # print("var_name_to_line_num", var_name_to_line_num, flush=True)
    # print("referencable_var_names", referencable_var_names, flush=True)

    code = replace_keywords(code, {C.SETTA_GENERATED_PYTHON: gen_code})

    print("code", code, flush=True)

    await lsp_writer.send_document_open_request(
        project["projectConfig"]["id"], code, codeJson=codeJson
    )

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
    run_as=RunType.THREAD,
    dependencies=["lsp_writer"],
)
