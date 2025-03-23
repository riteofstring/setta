from setta.utils.constants import C

from .code_task_fns.codeAreaAutocomplete import codeAreaAutocomplete
from .code_task_fns.codeAreaFindTemplateVars import codeAreaFindTemplateVars
from .code_task_fns.codeAreaInitializeCode import codeAreaInitializeCode
from .code_task_fns.findEVRefs import findEVRefs
from .code_task_fns.parametersRequest import parametersRequest
from .code_task_fns.textFieldAutocomplete import textFieldAutocomplete
from .code_task_fns.textFieldInitializeCode import textFieldInitializeCode
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
        elif messageType == C.WS_CODE_AREA_FIND_TEMPLATE_VARS:
            return await codeAreaFindTemplateVars(message, self.lsp_writers)
        elif messageType == C.WS_CODE_AREA_INITIALIZE_CODE:
            return await codeAreaInitializeCode(
                message, self.lsp_writers, self.code_state
            )
        elif messageType == C.WS_FIND_EV_REFS:
            return await findEVRefs(message, self.lsp_writers)
        elif messageType == C.WS_PARAMETERS_REQUEST:
            return await parametersRequest(message, self.lsp_writers, self.code_state)
        elif messageType == C.WS_TEXT_FIELD_AUTOCOMPLETE:
            return await textFieldAutocomplete(
                message, self.lsp_writers, self.code_state
            )
        elif messageType == C.WS_TEXT_FIELD_INITIALIZE_CODE:
            return await textFieldInitializeCode(
                message, self.lsp_writers, self.code_state
            )
        elif messageType == C.WS_TYPE_CHECK:
            return await typeCheck(message, self.lsp_writers)
