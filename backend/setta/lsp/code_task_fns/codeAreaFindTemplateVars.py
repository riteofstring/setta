import asyncio
from typing import List

from pydantic import BaseModel

from setta.code_gen.python.position_line_col import position_to_line_col
from setta.database.utils import create_new_id

from .utils import replace_template_vars_with_random_names


class CodeAreaFindTemplateVarsContent(BaseModel):
    sectionId: str
    candidateTemplateVars: List[list]
    fullText: str


class CodeAreaFindTemplateVars:
    def __init__(self, lsp_writers):
        self.lsp_writers = lsp_writers

    async def process_message(self, message):
        message_id = message["id"]
        message = CodeAreaFindTemplateVarsContent.parse_obj(message["content"])
        request_ids = await self.sendTemplateVarRequests(
            message_id,
            message.sectionId,
            message.candidateTemplateVars,
            message.fullText,
            local=False,
        )
        if len(request_ids) == 0:
            return {"content": {"data": {"positions": [], "numMessages": 1}}}

    async def sendTemplateVarRequests(
        self, message_id, sectionId, candidateTemplateVars, fullText, local
    ):
        if len(candidateTemplateVars) == 0:
            return []

        code, positions_to_test, _ = replace_template_vars_with_random_names(
            candidateTemplateVars, fullText
        )
        code_id = f"{sectionId}-find-template-vars"

        await self.lsp_writers["basic"].send_document_open_request(code_id, code)
        num_messages = len(positions_to_test)
        request_ids = []
        for idx in range(num_messages):
            startPos = positions_to_test[idx]
            line, col = position_to_line_col(code, startPos)
            request_id = f"{message_id}-{idx}"
            request_ids.append(request_id)
            self.lsp_writers["basic"].create_asyncio_task(
                self.lsp_writers["basic"].send_document_highlight_request(
                    line=line,
                    character=col,
                    code_id=code_id,
                    request_id=request_id,
                    return_id=message_id,
                    num_messages=num_messages,
                ),
                request_id,
                local=local,
            )

        return request_ids

    async def findTemplateVarsLocally(
        self,
        sectionId,
        candidateTemplateVars,
        fullText,
        fullNameToSectionId,
    ):
        templateVarRequestId = create_new_id()
        request_ids = await self.sendTemplateVarRequests(
            templateVarRequestId,
            sectionId,
            candidateTemplateVars,
            fullText,
            local=True,
        )

        if len(request_ids) == 0:
            return []

        responses = await self.waitForTemplateVarResponses(request_ids)
        positions = []
        for r in responses:
            positions.extend(r["data"]["positions"])
        return self.construct_template_vars(positions, fullNameToSectionId, fullText)

    def construct_template_vars(self, keyword_positions, fullNameToSectionId, fullText):
        output = []
        for k in keyword_positions:
            keyword = fullText[k["startPos"] : k["endPos"]]
            if keyword in fullNameToSectionId:
                output.append(
                    {
                        "sectionId": fullNameToSectionId[keyword],
                        "startPos": k["startPos"],
                        "keyword": keyword,
                    }
                )
        return output

    async def waitForTemplateVarResponses(self, request_ids):
        request_futures = []
        for r in request_ids:
            future = self.lsp_writers["basic"].wait_for_response(r)
            request_futures.append(future)

        return await asyncio.gather(*request_futures)
