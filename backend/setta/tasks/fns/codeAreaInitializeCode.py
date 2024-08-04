import json

from pydantic import BaseModel

from setta.code_gen.export_selected import export_selected, get_code
from setta.code_gen.python.generate_code import (
    generate_lines_of_code_without_imports,
    prepend_with_imports,
    generate_code,
    count_lines
)
from setta.code_gen.find_placeholders import needs_generated_python
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition


class CodeAreaInitializeCodeContent(BaseModel):
    project: dict
    sectionId: str


async def _codeAreaInitializeCode(message, lsp_writer):
    message = CodeAreaInitializeCodeContent.parse_obj(message.content)
    project = message.project
    code = project["sections"][message.sectionId]["code"]
    # if (needs_generated_python(code)):
    #     exporter_obj = export_selected(project)
    #     codeJson = exporter_obj.output
    #     infoToFullName = {
    #         tuple(json.loads(k)): v for k, v in project["infoToFullName"].items()
    #     }
    #     referencable_var_names = [
    #         infoToFullName[exporter_obj.var_name_reverse_mapping[v]]
    #         for v in var_name_to_line_num.items()
    #     ]

    print("code", code, flush=True)

    await lsp_writer.send_document_open_request(
        project["projectConfig"]["id"], code, codeJson=None
    )

    return {
        "output": None,
        "name": "codeAreaInitializeCode",
        "cache": None,
    }

def get_cache_key(projectConfigId, sectionId):
    return f"codeAreaInitializeCode-{projectConfigId}-{sectionId}"


def write_cache(cache, message, result):
    if result["cache"] is None:
        return
    message = CodeAreaInitializeCodeContent.parse_obj(message.content)
    cache[get_cache_key(message.project["projectConfig"]["id"], message.sectionId)] = result["cache"]


codeAreaInitializeCode = TaskDefinition(
    name="codeAreaInitializeCode",
    fn=_codeAreaInitializeCode,
    write_cache=write_cache,
    run_as=RunType.THREAD,
    is_built_in=True,
    dependencies=["lsp_writer"],
)
