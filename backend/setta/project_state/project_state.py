from setta.project_state.code_generator import ProjectPerspectiveCodeGenerator
from setta.project_state.section_state import SectionState


class ProjectState:
    def __init__(self, lsp_writers, websocket_msg_handler):
        self.lsp_writers = lsp_writers
        self.state = None
        self.section_states = {}
        self.code_generator = ProjectPerspectiveCodeGenerator(
            self.lsp_writers, websocket_msg_handler
        )

    async def update(self, project_state):
        self.state = project_state
        # filter out sections that are no longer in the project
        self.section_states = {
            k: v for k, v in self.section_states.items() if k in self.state["sections"]
        }

        # add new sections or update existing sections
        for sectionId in self.state["sections"].keys():
            if sectionId not in self.section_states:
                self.section_states[sectionId] = SectionState(
                    sectionId,
                    self.lsp_writers,
                )

        await self.code_generator.generate_code_previews(self.state)

    async def type_check(self):
        await self.code_generator.type_check()

    async def text_field_autocomplete(
        self, messageId, sectionId, paramInfoId, fullText, position
    ):
        await self.section_states[sectionId].text_field_autocomplete(
            messageId, paramInfoId, fullText, position
        )

    async def process_diagnostics_response(self, lsp_response):
        await self.code_generator.process_diagnostics_response(self.state, lsp_response)
