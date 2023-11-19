from collections import defaultdict


class Cache:
    def __init__(self):
        self.text_field_generated_code = defaultdict(dict)

    def add_text_field_generated_code(self, project_config_id, section_id, code):
        self.text_field_generated_code[project_config_id][section_id] = code
