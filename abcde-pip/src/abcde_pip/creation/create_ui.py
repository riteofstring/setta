import json

import yaml

from ..registration.imports_holder import ImportsHolder
from ..utils.type_map import TYPE_MAP
from .ui_creator import UICreator


def create_ui(entered_text):
    entered_text = entered_text.replace("\\n", "\n")
    entered_text = yaml.safe_load(entered_text)

    ui_specs = entered_text["UI"]

    imports = ui_specs.pop("IMPORTS", {})
    global_ih = ImportsHolder()
    global_ih.set_imports(imports)

    ui_types = ui_specs.pop("UI_TYPES", {})
    TYPE_MAP.register_from_dict(ui_types)

    sections = ui_specs.pop("SECTIONS", {})

    ui = UICreator()
    ui.create(sections, global_ih)

    factories = entered_text["FACTORIES"]
    funcs = entered_text["FUNCS"]

    return {"UI": ui.export(), "FACTORIES": factories, "FUNCS": funcs}
