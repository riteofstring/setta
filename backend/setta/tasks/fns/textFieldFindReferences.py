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
    code = generateCodeForReferenceFinding(message.candidateKeywords, message.fullText)
    code_id = f"{message.sectionId}-{message.paramInfoId}-find-references"

    await lsp_writer.send_document_open_request(code_id, code)
    for idx in range(len(message.candidateKeywords)):
        await lsp_writer.send_reference_request(
            line=idx, character=0, code_id=code_id, request_id=message_id
        )

    return {
        "content": None,
    }


def generateCodeForReferenceFinding(candidateKeywords, fullText):
    output = "\n".join([f"{x}=None" for x in candidateKeywords])
    return f"{output}\n{fullText}"


textFieldFindReferences = TaskDefinition(
    name="textFieldFindReferences",
    return_message_type="textFieldFindReferencesReturn",
    fn=_textFieldFindReferences,
    run_as=RunType.THREAD,
    dependencies=["lsp_writer"],
)
