from .code_state import CodeState


class CodeManager:
    def __init__(self, lsp_writers):
        self.states = {}  # project id to current state
        self.lsp_writers = lsp_writers

    def update_project_state(self, project_state):
        projectConfigId = project_state["projectConfig"]["id"]
        if projectConfigId not in self.states:
            self.states[projectConfigId] = CodeState(project_state, self.lsp_writers)
        else:
            self.states[projectConfigId].update(project_state)

    async def type_check(self, projectConfigId):
        await self.states[projectConfigId].type_check()
