from setta.utils.constants import CODE_FOLDER
from setta.websockets.websocket_msg_handlers import WMHProjectManager

from .project_state import ProjectState


class ProjectManager:
    def __init__(self, lsp_writers, websocket_manager):
        self.states = {}  # project config id to current state
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = WMHProjectManager(websocket_manager)
        self.temp_folder = CODE_FOLDER / "temp_folder"
        self.temp_folder.mkdir(parents=True, exist_ok=True)

    async def update(self, project_state):
        projectConfigId = project_state["projectConfig"]["id"]
        if projectConfigId not in self.states:
            self.states[projectConfigId] = ProjectState(
                self.lsp_writers,
                self.websocket_msg_handler,
                self.temp_folder,
            )
        await self.states[projectConfigId].update(project_state)

    async def type_check(self, projectConfigId):
        await self.states[projectConfigId].type_check()

    async def text_field_autocomplete(
        self, messageId, projectConfigId, sectionId, paramInfoId, fullText, position
    ):
        project_state = self.states[projectConfigId]
        await project_state.text_field_autocomplete(
            messageId, sectionId, paramInfoId, fullText, position
        )

    async def parameters_request(self, messageId, projectConfigId, sectionId, fullText):
        project_state = self.states[projectConfigId]
        await project_state.parameters_request(messageId, sectionId, fullText)

    async def delete_temp_files(self):
        for v in self.states.values():
            await v.delete_temp_files()

    async def get_gen_python_code_path(self, projectConfigId):
        return await self.states[projectConfigId].get_gen_python_code_path()

    async def cleanup(self):
        """Clean up all project states when shutting down"""
        for state in self.states.values():
            await state.cleanup()
