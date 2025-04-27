from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import (
    export_selected,
)
from setta.lsp.reader_fns.diagnostics import (
    convert_diagnostic_line_cols_to_positions,
    process_diagnostics,
)
from setta.project_state.section_state import SectionState


class ProjectState:
    def __init__(self, lsp_writers, websocket_msg_handler):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.state = None
        self.section_states = {}
        self.exporter_output = None

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
                    sectionId, self.lsp_writers
                )
            self.section_states[sectionId].update(self.state)

        exporter_obj = export_selected(
            self.state, always_export_args_objs=False, force_include_template_var=True
        )
        self.exporter_output = exporter_obj.output
        projectConfigName = self.state["projectConfig"]["name"]
        code_dict = await generate_final_code_for_sections(
            self.state,
            exporter_obj,
            lsp_writers=self.lsp_writers,
            folder_path=self.lsp_writers["full"].project_code_folder(projectConfigName),
        )

        # mark non-code sections as such
        for k, v in self.section_states.items():
            if k not in code_dict:
                v.is_code_block = False

        # update code block sections
        for k, v in code_dict.items():
            ss = self.section_states.get(k)
            if not ss:
                self.section_states[k] = SectionState(k, self.lsp_writers)
            self.section_states[k].update_with_code_dict(v)

    async def type_check(self):
        for section in self.section_states.values():
            await section.type_check()

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
            self.exporter_output,
            section.ref_template_var_positions,
        )
        content = {
            "projectConfigId": self.state["projectConfig"]["id"],
            "codeSectionId": sectionId,
            "diagnostics": diagnostics,
        }

        await self.websocket_msg_handler.broadcast_lsp_diagnostics(content)
