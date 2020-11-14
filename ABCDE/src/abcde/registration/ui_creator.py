from abcde.utils import common_functions as c_f, yaml_parsing as yp
from abcde.utils.constants import MODULE_INFO, CLASS_INFO, PARAMETER_INFO, ALL_KEYWORD
import abcde.registration as registration
import json
import typing
from .imports_holder import ImportsHolder
from ..utils.type_map import NestedObject, ListNestedObject, DictNestedObject


class UICreator:
    sections = {}

    def create(self, yaml_specs, global_ih):
        self.global_ih = global_ih
        for section_name, list_of_details in yaml_specs.items():
            infos = self.create_infos(list_of_details)
            for i in infos:
                self.add(section_name, i)

    def create_infos(self, list_of_details):
        local_ih = ImportsHolder()
        import_holders = [local_ih, self.global_ih]
        infos = []
        for details in list_of_details:
            for info_type, kwargs in details.items():
                if info_type == "IMPORTS":
                    local_ih.set_imports(kwargs)
                elif info_type == PARAMETER_INFO:
                    infos.append(
                        (getattr(registration, info_type)(**kwargs), info_type, None)
                    )
                else:
                    module_class_or_function = self.try_multiple_import_holders(
                        kwargs["name"], import_holders
                    )
                    original_name = kwargs.pop("name")
                    set_arg_types_info = kwargs.pop("set_type", None)
                    kwargs["obj"] = module_class_or_function
                    section_module = getattr(registration, info_type)(**kwargs)
                    self.set_arg_types(section_module, set_arg_types_info, info_type)
                    infos.append((section_module, info_type, original_name))
        return infos

    def set_arg_types(self, section_module, set_arg_types_info, info_type):
        if set_arg_types_info is not None:
            if info_type == MODULE_INFO:
                if ALL_KEYWORD in set_arg_types_info:
                    args = set_arg_types_info.pop(ALL_KEYWORD)
                    for o_t in section_module.obj_types:
                        obj_dict = getattr(section_module, o_t)
                        for obj_name in obj_dict.keys():
                            for arg, new_type in args.items():
                                new_type = self.process_new_type(new_type)
                                try:
                                    section_module.set_type(
                                        obj_name, arg, new_type, o_t
                                    )
                                except KeyError:
                                    pass
                else:
                    for obj_name, args in set_arg_types_info.items():
                        for arg, new_type in args.items():
                            new_type = self.process_new_type(new_type)
                            section_module.set_type(obj_name, arg, new_type)
            elif info_type == CLASS_INFO:
                for arg, new_type in set_arg_types_info.items():
                    new_type = self.process_new_type(new_type)
                    section_module.set_type(arg, new_type)

    def process_new_type(self, new_type):
        if isinstance(new_type, str):
            return new_type
        elif isinstance(new_type, list):
            infos = [x[0] for x in self.create_infos(new_type)]
            return NestedObject(infos)
        elif isinstance(new_type, dict):
            series_type = c_f.get_the_only_key(new_type)
            new_type = new_type[series_type]
            infos = [x[0] for x in self.create_infos(new_type)]
            if series_type == "list":
                return ListNestedObject(infos)
            if series_type == "dict":
                return DictNestedObject(infos)

    def try_multiple_import_holders(self, name, import_holders):
        for ih in import_holders:
            try:
                return ih.get_import(name)
            except:
                pass

    def add(self, name, info):
        info, info_type, original_name = info
        as_dict = info.as_dict()
        if info_type == CLASS_INFO:
            module_name, _ = yp.split_attr_from_modules(original_name)
            as_dict = {module_name: as_dict}
        if name in self.sections:
            curr_section = self.sections[name]
            if info_type not in curr_section:
                curr_section[info_type] = {}
            curr_section[info_type] = c_f.merge_dicts(curr_section[info_type], as_dict)
        else:
            self.sections[name] = {info_type: as_dict}

    def export(self, filepath=None):
        if filepath is not None:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(self.sections, f, ensure_ascii=False, indent=4)
        else:
            return json.dumps(self.sections, indent=4)
