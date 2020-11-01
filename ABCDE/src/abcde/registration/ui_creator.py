from abcde.utils import common_functions as c_f
import json


class UICreator:
    sections = {}

    def add(self, name, module_info):
        as_dict = module_info.as_dict()
        if name in self.sections:
            as_dict = c_f.merge_dicts(self.sections[name], as_dict)
        self.sections[name] = as_dict

    def export(self):
        return json.dumps(self.sections, indent=4)
