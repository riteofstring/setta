import asyncio
from typing import Any, Callable, List, Optional

from pydantic import BaseModel

from setta.tasks.task_runner import RunType
from setta.utils.constants import C


def send_document_open_request_with_code_dict(
    lsp_writers, code_dict, exporter_obj, projectConfigName
):
    for details in code_dict.values():
        asyncio.create_task(
            send_document_open_request(
                lsp_writers,
                details["code"],
                exporter_obj,
                projectConfigName,
                details["name"],
                details["is_gen_code"],
            )
        )


async def send_document_open_request(
    lsp_writers, code, exporter_obj, projectConfigName, sectionName, is_gen_code
):
    code_id = lsp_writers["full"].construct_code_id(
        projectConfigName,
        sectionName,
    )
    await lsp_writers["full"].send_document_open_request(
        code_id=code_id,
        code=code,
        codeJson=exporter_obj.output if exporter_obj else None,
        is_gen_code=is_gen_code,
    )

    return code_id


def do_nothing(*args, **kwargs):
    pass


class TaskDefinition(BaseModel):
    name: Optional[str] = ""
    return_message_type: str
    fn: Callable
    read_cache: Optional[Callable] = do_nothing
    write_cache: Optional[Callable] = do_nothing
    run_as: Optional[RunType] = RunType.NONE
    dependencies: Optional[List[str]] = None
    server_dependencies: Optional[List[str]] = []


class TaskMessage(BaseModel):
    id: str
    content: Any


class InteractiveTaskDefinition(TaskDefinition):
    return_message_type: str = C.WS_INTERACTIVE_RETURN


def get_task_metadata_for_frontend(task, exporter_obj=None):
    if isinstance(task, InteractiveTaskDefinition):
        # None means run the task on every change
        if task.dependencies is None:
            dependencies = None
        # Empty array means only run when the task imported.
        # Non-empty array means run when specified dependencies update.
        else:
            dependencies = [
                exporter_obj.var_name_reverse_mapping[d] for d in task.dependencies
            ]
        return {
            "name": task.name,
            "dependencies": dependencies,
        }
    return {"name": task.name}
