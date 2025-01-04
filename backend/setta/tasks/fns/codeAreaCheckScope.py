import asyncio
from typing import List

from pydantic import BaseModel

from setta.code_gen.python.generate_code import position_to_line_col
from setta.tasks.fns.findEVRefs import generate_unique_variable
from setta.tasks.task_runner import RunType
from setta.utils.utils import multireplace

from .utils import TaskDefinition


class CodeAreaCheckScopeContent(BaseModel):
    sectionId: str
    fullText: str
    gen_code_template_var: dict
    position: str


async def _codeAreaCheckScope(message, lsp_writers):
    message_id = message.id
    message = CodeAreaCheckScopeContent.parse_obj(message.content)
    candidateTemplateVars = message.candidateTemplateVars
    code, positions_to_test = generateCodeForTemplateVarFinding(
        candidateTemplateVars, message.fullText
    )
    code_id = f"{message.sectionId}-check-scope"

    await lsp_writers["basic"].send_document_open_request(code_id, code)
    for idx, startPos in enumerate(positions_to_test):
        line, col = position_to_line_col(code, startPos)
        request_id = f"{message_id}-{idx}"
        asyncio.create_task(
            lsp_writers["basic"].send_document_highlight_request(
                line=line,
                character=col,
                code_id=code_id,
                request_id=request_id,
                return_id=message_id,
            )
        )

    return None


# generate valid variable names because for example $SETTA_GENERATED_PYTHON is not valid
def generateCodeForTemplateVarFinding(candidateTemplateVars, fullText):
    var_name_mapping = {}
    keyword_to_pos = {}
    for keyword, pos in candidateTemplateVars:
        new_keyword = generate_unique_variable(fullText, keyword)
        var_name_mapping[keyword] = new_keyword
        # we only need 1 position of the keyword, even if there are multiple positions
        keyword_to_pos[keyword] = pos

    code = multireplace(fullText, var_name_mapping)
    return code, keyword_to_pos.values()


codeAreaFindTemplateVars = TaskDefinition(
    name="codeAreaCheckScope",
    return_message_type="codeAreaCheckScopeReturn",
    fn=_codeAreaCheckScope,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
