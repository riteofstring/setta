from typing import List

from pydantic import BaseModel

from setta.code_gen.python.generate_code import count_lines
from setta.tasks.task_runner import RunType

from .utils import TaskDefinition


class TextFieldFindReferencesContent(BaseModel):
    sectionId: str
    paramInfoId: str
    candidateKeywords: List[str]
    fullText: str


async def _textFieldFindReferences(message, lsp_writer):
    message_id = message.id
    message = TextFieldFindReferencesContent.parse_obj(message.content)
    candidateKeywords = message.candidateKeywords
    code, position_offset = generateCodeForReferenceFinding(
        candidateKeywords, message.fullText
    )
    code_id = f"{message.sectionId}-{message.paramInfoId}-find-references"

    await lsp_writer.send_document_open_request(code_id, code)
    for idx, variable_name in enumerate(candidateKeywords):
        await lsp_writer.send_reference_request(
            variable_name=variable_name,
            position_offset=position_offset,
            line=idx,
            character=0,
            code_id=code_id,
            request_id=message_id,
        )

    return {
        "content": None,
    }


def generateCodeForReferenceFinding(candidateKeywords, fullText):
    output = "\n".join([f"{x}=None" for x in candidateKeywords])
    # the plus 1 is for the newline between output and fullText
    position_offset = len(output) + 1
    return f"{output}\n{fullText}", position_offset


textFieldFindReferences = TaskDefinition(
    name="textFieldFindReferences",
    return_message_type="textFieldFindReferencesReturn",
    fn=_textFieldFindReferences,
    run_as=RunType.THREAD,
    dependencies=["lsp_writer"],
)
