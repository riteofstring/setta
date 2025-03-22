from setta.utils.constants import C

from .codeAreaAutocomplete import codeAreaAutocomplete
from .codeAreaFindTemplateVars import codeAreaFindTemplateVars
from .codeAreaInitializeCode import codeAreaInitializeCode
from .typeCheck import typeCheck


class CodeTasks:
    def __init__(self, lsp_writers):
        self.lsp_writers = lsp_writers
        self.cache = {}

    async def process_message(self, message):
        messageType = message["messageType"]
        if messageType == C.WS_CODE_AREA_AUTOCOMPLETE:
            return await codeAreaAutocomplete(message, self.lsp_writers, self.cache)
        elif messageType == C.WS_CODE_AREA_FIND_TEMPLATE_VARS:
            return await codeAreaFindTemplateVars(message, self.lsp_writers)
        elif messageType == C.WS_CODE_AREA_INITIALIZE_CODE:
            return await codeAreaInitializeCode(message, self.lsp_writers, self.cache)
        elif messageType == C.WS_TYPE_CHECK:
            return await typeCheck(message, self.lsp_writers)
