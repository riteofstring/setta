import asyncio
import random
import string
from typing import Any, Callable, List, Optional

from pydantic import BaseModel

from setta.tasks.task_runner import RunType
from setta.utils.constants import C
from setta.utils.utils import multireplace


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


def prepare_code_for_scope_checking(fullText, templateVars, target_template_var):
    the_special_var_name = None
    for t in templateVars:
        startPos = t["startPos"]
        keyword = t["keyword"]
        endPos = startPos + len(keyword)
        if t is target_template_var:
            # need to assign something to the replacement variable so that ast considers it a variable
            decl = "=None"
            # the [:-len(decl)] is to keep the full declaration the same length as the original keyword
            the_special_var_name = generate_unique_variable(fullText, keyword)[
                : -len(decl)
            ]
            replacement = the_special_var_name + decl
        else:
            # variable assignment not necessary for the keywords that we don't care about
            replacement = generate_unique_variable(fullText, keyword)
        fullText = fullText[:startPos] + replacement + fullText[endPos:]

    return fullText, the_special_var_name


# generate valid variable names because for example $SETTA_GENERATED_PYTHON is not valid
def replace_template_vars_with_random_names(candidateTemplateVars, fullText):
    var_name_mapping = {}
    reverse_var_name_mapping = {}
    keyword_to_pos = {}
    for keyword, pos in candidateTemplateVars:
        new_keyword = generate_unique_variable(fullText, keyword)
        var_name_mapping[keyword] = new_keyword
        reverse_var_name_mapping[new_keyword] = keyword
        # we only need 1 position of the keyword, even if there are multiple positions
        keyword_to_pos[keyword] = pos

    code = multireplace(fullText, var_name_mapping)
    return code, list(keyword_to_pos.values()), reverse_var_name_mapping


def generate_unique_variable(code, keyword):
    length = len(keyword)
    chars = string.ascii_lowercase + string.digits + "_"

    while True:
        # Ensure the variable starts with a letter or underscore
        new_var = random.choice(string.ascii_lowercase + "_")
        # Fill the rest with random characters
        new_var += "".join(random.choice(chars) for _ in range(length - 1))

        if new_var.isidentifier() and new_var not in code:
            return new_var


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


class SettaInMemoryFn(TaskDefinition):
    return_message_type: str = C.WS_IN_MEMORY_FN_RETURN


def get_task_metadata_for_frontend(task, exporter_obj=None):
    if isinstance(task, SettaInMemoryFn):
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
            task.name: {
                "dependencies": dependencies,
            }
        }
    return {task.name: {}}
