from setta.project_state.project_view import (
    ProjectView,
)
from setta.project_state.section_view import (
    SectionView,
)


class ProjectState:
    def __init__(self, lsp_writers, websocket_msg_handler, temp_folder, temp_folder_sv):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.temp_folder_sv = temp_folder_sv
        self.project_view = ProjectView(
            self.lsp_writers, self.websocket_msg_handler, self.temp_folder
        )
        self.section_views = {}

    async def update(self, project_state):
        # filter out sections that are no longer in the project
        self.section_views = {
            k: v
            for k, v in self.section_views.items()
            if k in project_state["sections"]
        }

        # add new sections or update existing sections
        for sectionId in project_state["sections"].keys():
            if sectionId not in self.section_views:
                self.section_views[sectionId] = SectionView(
                    sectionId,
                    self.lsp_writers,
                    self.websocket_msg_handler,
                    self.temp_folder_sv,
                )
            self.section_views[sectionId].update(project_state)

        await self.project_view.update(project_state)

    async def type_check(self):
        await self.project_view.type_check()

    async def text_field_autocomplete(
        self, messageId, sectionId, paramInfoId, fullText, position
    ):
        await self.section_views[sectionId].text_field_autocomplete(
            messageId, paramInfoId, fullText, position
        )

    async def process_diagnostics_response(self, lsp_response):
        await self.project_view.process_diagnostics_response(lsp_response)

    def delete_temp_files(self):
        self.project_view.delete_temp_files()
        for v in self.section_views.values():
            v.delete_temp_files()
