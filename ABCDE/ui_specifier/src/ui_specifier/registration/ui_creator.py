from ui_specifier.utils import common_functions as c_f, yaml_parsing as yp
from ui_specifier.utils.constants import (
    MODULE_INFO,
    CLASS_INFO,
    PARAMETER_INFO,
    ALL_KEYWORD,
)
import ui_specifier.registration as registration
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
                    module_name, the_module = self.try_multiple_import_holders(
                        kwargs.pop("name"), import_holders
                    )
                    set_arg_types = kwargs.pop("set_type", None)
                    set_ui_types = kwargs.pop("set_ui_type", None)
                    set_defaults = kwargs.pop("set_default", None)
                    kwargs["obj"] = the_module
                    section_module = getattr(registration, info_type)(**kwargs)
                    self.set_properties(
                        section_module, set_arg_types, info_type, "set_type"
                    )
                    self.set_properties(
                        section_module, set_ui_types, info_type, "set_ui_type"
                    )
                    self.set_properties(
                        section_module, set_defaults, info_type, "set_default"
                    )
                    infos.append((section_module, info_type, module_name))
        return infos

    def set_properties(self, section_module, input_set_args, info_type, func_name):
        if input_set_args is not None:
            func = getattr(section_module, func_name)
            if info_type == MODULE_INFO:
                if ALL_KEYWORD in input_set_args:
                    args = input_set_args.pop(ALL_KEYWORD)
                    for obj_name in section_module.objs.keys():
                        for arg, new_property in args.items():
                            if func_name == "set_type":
                                new_property = self.process_new_type(new_property)
                            try:
                                func(obj_name, arg, new_property)
                            except KeyError:
                                pass
                else:
                    for obj_name, args in input_set_args.items():
                        for arg, new_property in args.items():
                            new_property = self.process_new_type(new_property)
                            func(obj_name, arg, new_property)
            elif info_type == CLASS_INFO:
                for arg, new_property in input_set_args.items():
                    new_property = self.process_new_type(new_property)
                    func(arg, new_property)

    def process_new_type(self, new_type):
        if isinstance(new_type, str):
            return new_type
        elif isinstance(new_type, list):
            return NestedObject(self.create_infos(new_type))
        elif isinstance(new_type, dict):
            series_type = c_f.get_the_only_key(new_type)
            new_type = new_type[series_type]
            infos = self.create_infos(new_type)
            if series_type == "list":
                return ListNestedObject(infos)
            if series_type == "dict":
                return DictNestedObject(infos)

    def try_multiple_import_holders(self, name, import_holders):
        errors = []
        for ih in import_holders:
            try:
                return ih.get_import(name)
            except BaseException as e:
                errors.append(e)
        raise AttributeError(errors)

    def add(self, name, info):
        info, info_type, module_name = info
        if info_type == CLASS_INFO:
            as_dict = c_f.class_info_to_module_info(info, module_name)
            info_type = MODULE_INFO
        else:
            as_dict = info.as_dict()
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
            return json.dumps(self.sections)
