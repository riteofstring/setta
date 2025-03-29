class CodeState:
    def __init__(self):
        self.cache = {}

    def get_state(self, projectConfigId, sectionId, paramInfoId):
        return self.cache.get(
            self.get_state_key(projectConfigId, sectionId, paramInfoId)
        )

    def set_state(self, projectConfigId, sectionId, paramInfoId, data):
        self.cache[self.get_state_key(projectConfigId, sectionId, paramInfoId)] = data

    def get_state_key(self, projectConfigId, sectionId, paramInfoId):
        return f"{projectConfigId}-{sectionId}-{paramInfoId}"
