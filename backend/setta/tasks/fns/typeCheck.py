import asyncio
from pathlib import Path

from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import export_selected
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition


# this just initializes a document which gets the lsp to send back diagnostics
async def _typeCheck(message, lsp_writers):
    project = message.content
    exporter_obj = export_selected(
        project, always_export_args_objs=False, force_include_template_var=True
    )
    projectConfigName = project["projectConfig"]["name"]
    code, _ = generate_final_code_for_sections(
        project,
        exporter_obj,
        lsp_writers["full"].project_code_folder(projectConfigName),
    )
    for details in code.values():
        code_id = lsp_writers["full"].construct_code_id(projectConfigName, details["name"])
        asyncio.create_task(
            lsp_writers["full"].send_document_open_request(
                code_id=code_id,
                code=details["code"],
                codeJson=exporter_obj.output,
                is_gen_code=details["is_gen_code"],
            )
        )

    return {"content": None}


typeCheck = TaskDefinition(
    name="typeCheck",
    return_message_type="typeCheckReturn",
    fn=_typeCheck,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
