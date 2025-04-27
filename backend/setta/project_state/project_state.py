from setta.project_state.project_perspective_code_generator import (
    ProjectPerspectiveCodeGenerator,
)
from setta.project_state.section_perspective_code_generator import (
    SectionPerspectiveCodeGenerator,
)


class ProjectState:
    def __init__(self, lsp_writers, websocket_msg_handler):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.code_generator = ProjectPerspectiveCodeGenerator(
            self.lsp_writers, websocket_msg_handler
        )
        self.section_perspective_code_generators = {}

    async def update(self, project_state):
        # filter out sections that are no longer in the project
        self.section_perspective_code_generators = {
            k: v
            for k, v in self.section_perspective_code_generators.items()
            if k in project_state["sections"]
        }

        # add new sections or update existing sections
        for sectionId in project_state["sections"].keys():
            if sectionId not in self.section_perspective_code_generators:
                self.section_perspective_code_generators[sectionId] = (
                    SectionPerspectiveCodeGenerator(
                        sectionId, self.lsp_writers, self.websocket_msg_handler
                    )
                )
            self.section_perspective_code_generators[sectionId].update(project_state)

        await self.code_generator.update(project_state)

    async def type_check(self):
        await self.code_generator.type_check()

    async def text_field_autocomplete(
        self, messageId, sectionId, paramInfoId, fullText, position
    ):
        await self.section_perspective_code_generators[
            sectionId
        ].text_field_autocomplete(messageId, paramInfoId, fullText, position)

    async def process_diagnostics_response(self, lsp_response):
        await self.code_generator.process_diagnostics_response(lsp_response)
