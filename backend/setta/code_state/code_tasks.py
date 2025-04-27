from setta.utils.constants import C

from .code_task_fns.codeAreaAutocomplete import codeAreaAutocomplete
from .code_task_fns.parametersRequest import parametersRequest
from .code_task_fns.textFieldAutocomplete import textFieldAutocomplete
from .code_task_fns.typeCheck import typeCheck


class CodeTasks:
    def __init__(self, code_state, lsp_writers):
        self.lsp_writers = lsp_writers
        self.code_state = code_state

    async def process_message(self, message):
        messageType = message["messageType"]
        if messageType == C.WS_CODE_AREA_AUTOCOMPLETE:
            return await codeAreaAutocomplete(
                message, self.lsp_writers, self.code_state
            )
        elif messageType == C.WS_PARAMETERS_REQUEST:
            return await parametersRequest(message, self.lsp_writers, self.code_state)
        elif messageType == C.WS_TEXT_FIELD_AUTOCOMPLETE:
            return await textFieldAutocomplete(
                message, self.lsp_writers, self.code_state
            )

    async def process_post_request(self, message, address):
        if address == C.ROUTE_TYPE_CHECK:
            return await typeCheck(message, self.lsp_writers)
