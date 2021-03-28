import json

import yaml

from ..utils.type_map import TYPE_MAP
from .ui_creator import UICreator


def _create_ui(loaded_yaml):
    ui_types = loaded_yaml.pop("UI_TYPES", {})
    TYPE_MAP.register_from_dict(ui_types)

    modules = loaded_yaml.pop("MODULES", {})

    ui_creator = UICreator()
    ui_creator.create(modules)
    modules = ui_creator.export()

    ui = loaded_yaml["UI"]
    factories = loaded_yaml["FACTORIES"]
    funcs = loaded_yaml["FUNCS"]

    return {"MODULES": modules, "UI": ui, "FACTORIES": factories, "FUNCS": funcs}


def create_ui(entered_text):
    entered_text = entered_text.replace("\\n", "\n")
    entered_text = yaml.safe_load(entered_text)
    return _create_ui(loaded_yaml)
