import asyncio
import random
import string
from typing import List, Optional

from pydantic import BaseModel

from setta.code_gen.export_selected import get_gen_code_template_var
from setta.tasks.task_runner import RunType
from setta.utils.utils import multireplace

from .utils import TaskDefinition

# TODO: for each candidate evRef, check if it's in the same scope as $SETTA_GENERATED_PYTHON
# Replace $SETTA_GENERATED_PYTHON with random characters so that it's a valid python value
# and declare it equal to something, like dlkfslkdjf=None.
# Then use the ast-based function that claude wrote to check if each position in the candidate evRefs
# is in the same scope as the randomly-named variable.


class TextFieldFindReferencesContent(BaseModel):
    sectionId: str
    paramInfoId: Optional[str] = None
    candidateEVRefs: List[str]
    templateVars: Optional[List[dict]] = None
    onlyAfterGenCodeTemplateVar: Optional[bool] = False
    fullText: str


async def _findEVRefs(message, lsp_writers):
    message_id = message.id
    message = TextFieldFindReferencesContent.parse_obj(message.content)
    candidateEVRefs = filterCandidatesByScope(
        message.candidateEVRefs,
        message.fullText,
        message.onlyAfterGenCodeTemplateVar,
        message.templateVars,
    )

    if len(candidateEVRefs) == 0:
        return {"content": {"positions": [], "numMessages": 1}}

    code, position_offset = generateCodeForReferenceFinding(
        candidateEVRefs,
        message.fullText,
        message.onlyAfterGenCodeTemplateVar,
        message.templateVars,
    )
    code_id = f"{message.sectionId}-{message.paramInfoId}-find-references"

    print(f"_findEVRefs\n{code}", flush=True)

    await lsp_writers["basic"].send_document_open_request(code_id, code)
    num_messages = len(candidateEVRefs)
    for idx in range(num_messages):
        request_id = f"{message_id}-{idx}"
        asyncio.create_task(
            lsp_writers["basic"].send_reference_request(
                position_offset=position_offset,
                line=idx,
                character=0,
                code_id=code_id,
                request_id=request_id,
                return_id=message_id,
                num_messages=num_messages,
            )
        )

    return None


def filterCandidatesByScope(
    candidateEVRefs, fullText, onlyAfterGenCodeTemplateVar, templateVars
):
    if not onlyAfterGenCodeTemplateVar:
        return candidateEVRefs
    matching_template_var = get_gen_code_template_var(templateVars)
    if matching_template_var is None:
        return []

    # TODO
    return candidateEVRefs


def generateCodeForReferenceFinding(
    candidateEVRefs, fullText, onlyAfterGenCodeTemplateVar, templateVars
):
    position_offset = 0

    if onlyAfterGenCodeTemplateVar:
        matching_template_var = get_gen_code_template_var(templateVars)
        if matching_template_var is None:
            return "", position_offset
        # If SETTA_GENERATED_PYTHON is present, we only want to consider
        # code that comes after it.
        startPos = matching_template_var["startPos"]
        keyword = matching_template_var["keyword"]
        endPos = startPos + len(keyword)
        template_str_len = endPos - startPos
        before_text = fullText[:startPos]
        fullText = fullText[endPos:]
        position_offset -= len(before_text) + template_str_len

    output = []
    var_name_mapping = {}
    for keyword in candidateEVRefs:
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


findEVRefs = TaskDefinition(
    name="findEVRefs",
    return_message_type="findEVRefsReturn",
    fn=_findEVRefs,
    run_as=RunType.NONE,
    server_dependencies=["lsp_writers"],
)
