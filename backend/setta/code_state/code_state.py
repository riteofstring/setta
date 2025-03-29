class CodeState:
    def __init__(self):
        # maps from project
        self.states = {}

    def get_state(self, projectConfigId):
        return self.states.get(projectConfigId)
    


class ProjectCodeState:
    def __init__(self):
        self.states = {}
        self.exporter_obj = None
        self.fullNameToInfo = None
        self.fullNameToSectionId = None



class CodeBlockState:
    def __init__(self):
        self.version = 0
        self.template_var_replacement_values = None
        self.generated_var_names = None
        
       


