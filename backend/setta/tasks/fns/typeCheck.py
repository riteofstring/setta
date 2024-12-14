from setta.code_gen.export_selected import (
    export_selected,
    get_first_section_code_that_needs_generated_python,
)
from setta.code_gen.python.generate_code import generate_code
from setta.tasks.task_runner import RunType
from setta.utils.constants import add_base_ui_types

from .utils import TaskDefinition


# this just initializes a document which gets the lsp to send back diagnostics
async def _typeCheck(message, lsp_writers):
    project = message.content
    add_base_ui_types(project)
    exporter_obj = export_selected(project, always_export_args_objs=False)
    codeJson = exporter_obj.output
    templatedCode = get_first_section_code_that_needs_generated_python(project)
    code = generate_code(codeJson, templatedCode)[0]
    await lsp_writers["full"].send_document_open_request(
        project["projectConfig"]["id"], code, codeJson
    )

    return {"content": None}


typeCheck = TaskDefinition(
    name="typeCheck",
    return_message_type="typeCheckReturn",
    fn=_typeCheck,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
