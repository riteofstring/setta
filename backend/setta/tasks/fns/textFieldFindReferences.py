import asyncio
import random
import string
from typing import List, Optional

from pydantic import BaseModel

from setta.code_gen.python.generate_code import double_braces
from setta.tasks.task_runner import RunType
from setta.utils.constants import C
from setta.utils.utils import multireplace

from .utils import TaskDefinition


class TextFieldFindReferencesContent(BaseModel):
    sectionId: str
    paramInfoId: Optional[str] = None
    candidateKeywords: List[str]
    fullText: str


async def _textFieldFindReferences(message, lsp_writers):
    message_id = message.id
    message = TextFieldFindReferencesContent.parse_obj(message.content)
    candidateKeywords = message.candidateKeywords
    code, position_offset = generateCodeForReferenceFinding(
        candidateKeywords, message.fullText
    )
    code_id = f"{message.sectionId}-{message.paramInfoId}-find-references"

    await lsp_writers["basic"].send_document_open_request(code_id, code)
    for idx in range(len(candidateKeywords)):
        request_id = f"{message_id}-{idx}"
        asyncio.create_task(
            lsp_writers["basic"].send_reference_request(
                position_offset=position_offset,
                line=idx,
                character=0,
                code_id=code_id,
                request_id=request_id,
                return_id=message_id,
            )
        )

    return {
        "content": None,
    }


def generateCodeForReferenceFinding(candidateKeywords, fullText):
    # If SETTA_GENERATED_PYTHON is present, we only want to consider
    # code that comes after it.
    template_str = double_braces(C.SETTA_GENERATED_PYTHON)
    split_by_gen_code = fullText.split(template_str)
    position_offset = 0
    if len(split_by_gen_code) > 1:
        position_offset -= len(split_by_gen_code[0]) + len(template_str)
        fullText = split_by_gen_code[1]

    output = []
    var_name_mapping = {}
    for keyword in candidateKeywords:
        # Replace reference names like
        # list_of_models[0]
        # with a random valid variable name of the same length.
        # If "[" is ever in the keyword,
        # we know it will have a length of at least 4, e.g. x[0] has 4 characters.
        # So we don't have to worry about clashes.
        if "[" in keyword:
            new_keyword = generate_unique_variable(fullText, keyword)
            var_name_mapping[keyword] = new_keyword
            keyword = new_keyword
        output.append(f"{keyword}=None")

    output = "\n".join(output)
    # the plus 1 is for the newline between output and fullText
    position_offset += len(output) + 1
    if len(var_name_mapping) > 0:
        fullText = multireplace(fullText, var_name_mapping)
    return f"{output}\n{fullText}", position_offset


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


textFieldFindReferences = TaskDefinition(
    name="textFieldFindReferences",
    return_message_type="textFieldFindReferencesReturn",
    fn=_textFieldFindReferences,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
