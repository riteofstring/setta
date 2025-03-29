class CodeState:
    def __init__(self):
        self.cache = {}
        self.exporter_obj_interactive = {}

    def get_state(self, projectConfigId, sectionId, paramInfoId):
        return self.cache.get(
            self.get_state_key(projectConfigId, sectionId, paramInfoId)
        )

    def set_state(self, projectConfigId, sectionId, paramInfoId, data):
        self.cache[self.get_state_key(projectConfigId, sectionId, paramInfoId)] = data

    def get_state_key(self, projectConfigId, sectionId, paramInfoId):
        return f"{projectConfigId}-{sectionId}-{paramInfoId}"

    def get_exporter_obj_interactive(self, websocket_id):
        return self.exporter_obj_interactive.get(websocket_id)

    def set_exporter_obj_interactive(self, websocket_id, exporter_obj):
        self.exporter_obj_interactive[websocket_id] = exporter_obj
