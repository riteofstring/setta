from setta.lsp.reader_fns.diagnostics import (
    convert_diagnostic_line_cols_to_positions,
    process_diagnostics,
)
from setta.project_state.code_generator import ProjectPerspectiveCodeGenerator
from setta.project_state.section_state import SectionState


class ProjectState:
    def __init__(self, lsp_writers, websocket_msg_handler):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.state = None
        self.section_states = {}
        self.exporter_output = None
        self.code_generator = ProjectPerspectiveCodeGenerator(self.lsp_writers)

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
            self.section_states[sectionId].update(self.state)

        self.code_generator.generate_code_previews(self.state)

    async def type_check(self):
        await self.code_generator.type_check()

    async def text_field_autocomplete(
        self, messageId, sectionId, paramInfoId, fullText, position
    ):
        await self.section_states[sectionId].text_field_autocomplete(
            messageId, paramInfoId, fullText, position
        )

    def get_uri_code_block(self, uri):
        for sectionId, section in self.section_states.items():
            if section.uri == uri:
                return sectionId, section
        return None, None

    async def process_diagnostics_response(self, lsp_response):
        params = lsp_response["params"]
        sectionId, section = self.get_uri_code_block(params["uri"])
        if not section or section.version != params["version"]:
            return
        convert_diagnostic_line_cols_to_positions(section.code, params["diagnostics"])
        diagnostics = process_diagnostics(
            params["diagnostics"],
            section.code,
            self.code_generator.exporter_output,
            section.ref_template_var_positions,
        )
        content = {
            "projectConfigId": self.state["projectConfig"]["id"],
            "codeSectionId": sectionId,
            "diagnostics": diagnostics,
        }

        await self.websocket_msg_handler.broadcast_lsp_diagnostics(content)
