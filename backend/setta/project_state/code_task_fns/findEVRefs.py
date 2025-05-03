import asyncio
from typing import List, Optional

from pydantic import BaseModel

from setta.database.utils import create_new_id

from .utils import (
    find_candidate_ev_refs,
)


class TextFieldFindReferencesContent(BaseModel):
    sectionId: str
    paramInfoId: Optional[str] = None
    templateVars: Optional[List[dict]] = None
    onlyAfterGenCodeTemplateVar: Optional[bool] = False
    fullText: str


async def findEVRefs(message, lsp_writers):
    message_id = message["id"]
    message = TextFieldFindReferencesContent.parse_obj(message["content"])
    candidateEVRefs = find_candidate_ev_refs()
    request_ids = await sendEVRefRequests(
        message_id,
        message.sectionId,
        message.paramInfoId,
        candidateEVRefs,
        message.templateVars,
        message.onlyAfterGenCodeTemplateVar,
        message.fullText,
        lsp_writers,
        local=False,
    )

    if len(request_ids) == 0:
        return {"data": {"positions": [], "numMessages": 1}}

    return None


async def sendEVRefRequests(
    message_id,
    sectionId,
    paramInfoId,
    candidateEVRefs,
    templateVars,
    onlyAfterGenCodeTemplateVar,
    fullText,
    lsp_writers,
    local,
):
    candidateEVRefs = filterCandidatesByScope(
        candidateEVRefs,
        fullText,
        onlyAfterGenCodeTemplateVar,
        templateVars,
    )

    if len(candidateEVRefs) == 0:
        return []

    code, position_offset, num_keywords = generateCodeForReferenceFinding(
        candidateEVRefs,
        fullText,
        onlyAfterGenCodeTemplateVar,
        templateVars,
    )
    code_id = f"{sectionId}-{paramInfoId}-find-references"

    await lsp_writers["basic"].send_document_open_request(code_id, code)
    request_ids = []
    for idx in range(num_keywords):
        request_id = f"{message_id}-{idx}"
        request_ids.append(request_id)
        lsp_writers["basic"].create_asyncio_task(
            lsp_writers["basic"].send_reference_request(
                position_offset=position_offset,
                line=idx,
                character=0,
                code_id=code_id,
                request_id=request_id,
                return_id=message_id,
                num_messages=num_keywords,
            ),
            request_id,
            local=local,
        )

    return request_ids


async def findEVRefsLocally(
    sectionId,
    paramInfoId,
    candidateEVRefs,
    templateVars,
    onlyAfterGenCodeTemplateVar,
    fullText,
    fullNameToInfo,
    lsp_writers,
):
    evRefRequestId = create_new_id()
    request_ids = await sendEVRefRequests(
        evRefRequestId,
        sectionId,
        paramInfoId,
        candidateEVRefs,
        templateVars,
        onlyAfterGenCodeTemplateVar,
        fullText,
        lsp_writers,
        local=True,
    )

    if len(request_ids) == 0:
        return []

    responses = await waitForEVRefResponses(request_ids, lsp_writers)
    positions = []
    for r in responses:
        positions.extend(r["data"]["positions"])
    return construct_ev_refs(positions, fullNameToInfo, fullText)


def construct_ev_refs(keyword_positions, fullNameToInfo, fullText):
    output = []
    for k in keyword_positions:
        keyword = fullText[k["startPos"] : k["endPos"]]
        if keyword in fullNameToInfo:
            info = fullNameToInfo[keyword]
            output.append(
                {
                    "sectionId": info["sectionId"],
                    "paramInfoId": info["paramInfoId"],
                    "isArgsObj": info["isArgsObj"],
                    "startPos": k["startPos"],
                    "keyword": keyword,
                }
            )
    return output


async def waitForEVRefResponses(request_ids, lsp_writers):
    request_futures = []
    for r in request_ids:
        future = lsp_writers["basic"].wait_for_response(r)
        request_futures.append(future)

    return await asyncio.gather(*request_futures)
