class CodeManager:
    def __init__(self):
        self.states = {}  # project id to current state

    def update_project_state(self, project_state):
        projectConfigId = project_state["projectConfig"]["id"]
        self.states[projectConfigId] = project_state

    async def type_check(self, projectConfigId):
        print("type_check!!", self.states.get(projectConfigId), flush=True)
