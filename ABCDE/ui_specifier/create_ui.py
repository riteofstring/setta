import sys
sys.path.insert(0, "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\src")
import argparse        
import yaml
from ui_specifier.registration.imports_holder import ImportsHolder
from ui_specifier.registration.ui_creator import UICreator
from ui_specifier.utils.type_map import TYPE_MAP

def main(args):
    ui_specs = args.ui_specs.replace("\\n", "\n")
    ui_specs = yaml.safe_load(ui_specs)

    imports = ui_specs.pop("IMPORTS", {})
    global_ih = ImportsHolder()
    global_ih.set_imports(imports)

    ui_types = ui_specs.pop("UI_TYPES", {})
    TYPE_MAP.register_from_dict(ui_types)

    sections = ui_specs.pop("SECTIONS", {})
    
    ui = UICreator()
    ui.create(sections, global_ih)

    test_filepath = "D:\\Documents\\App Development\\abcde-frontend\\src\\data\\fromUI.json"
    ui.export(test_filepath)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("ui_specs")
    args = parser.parse_args()
    main(args)