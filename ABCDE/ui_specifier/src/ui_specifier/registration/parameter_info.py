from ..utils.type_map import TYPE_MAP
from .base_info import BaseInfo


class ParameterInfo(BaseInfo):
    defaults = {"default_val": "", "type": ""}

    def __init__(self, **kwargs):
        self.params = {}
        for param_name, properties in kwargs.items():
            if properties is None:
                properties = {}
            for k, v in self.defaults.items():
                properties[k] = properties.get(k, v)
            try:
                actual_type = self.str_to_type(properties["type"])
            except:
                actual_type = properties["type"]
            properties["ui_type"] = TYPE_MAP.get_ui_type(actual_type)
            self.params[param_name] = properties

    def as_dict(self):
        return self.params
