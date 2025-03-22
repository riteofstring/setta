from setta.lsp.code_task_fns.codeAreaFindTemplateVars import CodeAreaFindTemplateVars
from setta.utils.constants import C

from .codeAreaAutocomplete import CodeAreaAutocomplete


class CodeTasks:
    def __init__(self, lsp_writers):
        self.cache = {}
        self.code_area_autocomplete = CodeAreaAutocomplete(lsp_writers, self.cache)
        self.code_area_find_template_vars = CodeAreaFindTemplateVars(lsp_writers)

    async def process_message(self, message):
        messageType = message["messageType"]
        obj = None
        if messageType == C.WS_CODE_AREA_AUTOCOMPLETE:
            obj = self.code_area_autocomplete
        elif messageType == C.WS_CODE_AREA_FIND_TEMPLATE_VARS:
            obj = self.code_area_find_template_vars

        result = await obj.process_message(message)
        return result
