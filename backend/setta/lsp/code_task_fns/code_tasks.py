from setta.utils.constants import C

from .codeAreaAutocomplete import CodeAreaAutocomplete
from .codeAreaFindTemplateVars import CodeAreaFindTemplateVars
from .typeCheck import TypeCheck


class CodeTasks:
    def __init__(self, lsp_writers):
        self.cache = {}
        self.code_area_autocomplete = CodeAreaAutocomplete(lsp_writers, self.cache)
        self.code_area_find_template_vars = CodeAreaFindTemplateVars(lsp_writers)
        self.type_check = TypeCheck(lsp_writers)

    async def process_message(self, message):
        messageType = message["messageType"]
        obj = None
        if messageType == C.WS_CODE_AREA_AUTOCOMPLETE:
            obj = self.code_area_autocomplete
        elif messageType == C.WS_CODE_AREA_FIND_TEMPLATE_VARS:
            obj = self.code_area_find_template_vars
        elif messageType == C.WS_TYPE_CHECK:
            obj = self.type_check

        result = await obj.process_message(message)
        return result
