import asyncio
from typing import List

from pydantic import BaseModel

from setta.code_gen.python.position_line_col import position_to_line_col
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition, replace_template_vars_with_random_names


class CodeAreaFindTemplateVarsContent(BaseModel):
    sectionId: str
    candidateTemplateVars: List[list]
    fullText: str


async def _codeAreaFindTemplateVars(message, lsp_writers):
    message_id = message.id
    message = CodeAreaFindTemplateVarsContent.parse_obj(message.content)
    candidateTemplateVars = message.candidateTemplateVars

    if len(candidateTemplateVars) == 0:
        return {"content": {"positions": [], "numMessages": 1}}

    code, positions_to_test, _ = replace_template_vars_with_random_names(
        candidateTemplateVars, message.fullText
    )
    code_id = f"{message.sectionId}-find-template-vars"

    await lsp_writers["basic"].send_document_open_request(code_id, code)
    num_messages = len(positions_to_test)
    for idx in range(num_messages):
        startPos = positions_to_test[idx]
        line, col = position_to_line_col(code, startPos)
        request_id = f"{message_id}-{idx}"
        asyncio.create_task(
            lsp_writers["basic"].send_document_highlight_request(
                line=line,
                character=col,
                code_id=code_id,
                request_id=request_id,
                return_id=message_id,
                num_messages=num_messages,
            )
        )

    return None


codeAreaFindTemplateVars = TaskDefinition(
    name="codeAreaFindTemplateVars",
    return_message_type="codeAreaFindTemplateVarsReturn",
    fn=_codeAreaFindTemplateVars,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
