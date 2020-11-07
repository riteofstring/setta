from abcde.utils import common_functions as c_f
import json
import typing
from .imports_holder import ImportsHolder
from abcde.registration.class_info import ClassInfo
from abcde.registration.module_info import ModuleInfo


class UICreator:
    sections = {}
    info_classes: typing.Final = {"ModuleInfo": ModuleInfo, "ClassInfo": ClassInfo}

    def create(self, yaml_specs, global_ih):
        for section_name, list_of_details in yaml_specs.items():
            local_ih = ImportsHolder()
            import_holders = [local_ih, global_ih]
            for details in list_of_details:
                for info_type, kwargs in details.items():
                    if info_type == "IMPORTS":
                        local_ih.set_imports(kwargs)
                    else:
                        module_class_or_function = self.try_multiple_import_holders(
                            kwargs["name"], import_holders
                        )
                        kwargs.pop("name")
                        set_arg_types_info = kwargs.pop("set_type", None)
                        if info_type == "ModuleInfo":
                            kwargs["module"] = module_class_or_function
                        elif info_type == "ClassInfo":
                            kwargs["input_class"] = module_class_or_function
                        section_module = self.info_classes[info_type](**kwargs)
                        self.set_arg_types(
                            section_module, set_arg_types_info, info_type
                        )
                        self.add(section_name, section_module)

    def set_arg_types(self, section_module, set_arg_types_info, info_type):
        if set_arg_types_info is not None:
            if info_type == "ModuleInfo":
                for obj_name, args in set_arg_types_info.items():
                    for arg, new_type in args.items():
                        section_module.set_type(obj_name, arg, new_type)

    def try_multiple_import_holders(self, name, import_holders):
        for ih in import_holders:
            try:
                return ih.get_import(name)
            except:
                pass

    def add(self, name, module_info):
        as_dict = module_info.as_dict()
        if name in self.sections:
            as_dict = c_f.merge_dicts(self.sections[name], as_dict)
        self.sections[name] = as_dict

    def export(self, filepath=None):
        if filepath is not None:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(self.sections, f, ensure_ascii=False, indent=4)
        else:
            return json.dumps(self.sections, indent=4)
