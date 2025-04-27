from setta.project_state.code_generator import SectionPerspectiveCodeGenerator


class SectionState:
    def __init__(self, sectionId, lsp_writers):
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.code_generator = SectionPerspectiveCodeGenerator(
            self.sectionId, self.lsp_writers
        )

    async def text_field_initialize(self, paramInfoId):
        pass

    async def text_field_autocomplete(self, messageId, paramInfoId, fullText, position):
        print("text_field_autocomplete", self.sectionId, flush=True)
