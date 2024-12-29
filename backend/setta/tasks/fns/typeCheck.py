from setta.code_gen.export_selected import export_selected
from setta.code_gen.python.generate_code import generate_code
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition


# this just initializes a document which gets the lsp to send back diagnostics
async def _typeCheck(message, lsp_writers):
    project = message.content
    exporter_obj = export_selected(
        project, always_export_args_objs=False, force_include_template_var=True
    )
    codeJson = exporter_obj.output
    code = generate_code(
        codeJson,
        exporter_obj.code_with_gen_code_template_var["code"],
        exporter_obj.code_with_gen_code_template_var["templateVar"],
    )[0]
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
