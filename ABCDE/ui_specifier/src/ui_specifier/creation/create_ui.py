import yaml

from ..registration.imports_holder import ImportsHolder
from ..registration.ui_creator import UICreator
from ..utils.type_map import TYPE_MAP


def create_ui(ui_specs):
    ui_specs = ui_specs.replace("\\n", "\n")
    ui_specs = yaml.safe_load(ui_specs)

    imports = ui_specs.pop("IMPORTS", {})
    global_ih = ImportsHolder()
    global_ih.set_imports(imports)

    ui_types = ui_specs.pop("UI_TYPES", {})
    TYPE_MAP.register_from_dict(ui_types)

    sections = ui_specs.pop("SECTIONS", {})

    ui = UICreator()
    ui.create(sections, global_ih)
    return ui.export()
