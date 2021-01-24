import ast
import copy
import importlib
import string
from collections import defaultdict

import yaml

from .common_functions import get_the_only_key, get_the_only_value, merge_dicts
from .constants import KWARGS_KEYWORD, REF_KEYWORD, SEPARATOR


def load_yaml(fname):
    with open(fname, "r") as f:
        loaded_yaml = yaml.safe_load(f)
    return loaded_yaml


def keys_as_list(config):
    return list(config.keys())


def split_attr_from_modules(input_string):
    modules = input_string.split(".")
    attr_name = modules.pop()
    modules = ".".join(modules)
    return modules, attr_name


def string_to_attr(input_string):
    modules, attr_name = split_attr_from_modules(input_string)
    imported_module = importlib.import_module(modules)
    return getattr(imported_module, attr_name)


def represents_object(x):
    return "." in x


def is_simple_ref(x):
    return isinstance(x, str) and x.startswith(REF_KEYWORD)


def is_kwargs_ref(x):
    return isinstance(x, str) and x.startswith(KWARGS_KEYWORD)


def is_ref(x):
    return is_simple_ref(x) or is_kwargs_ref(x)


def remove_ref(x):
    return x.replace(REF_KEYWORD, "").replace(KWARGS_KEYWORD, "")


def get_full_name(parent_name, name):
    if parent_name is not None:
        return f"{parent_name}{SEPARATOR}{name}"
    return name


def get_name_from_full_name(full_name):
    return full_name.split(SEPARATOR)[-1]


def set_value(x, ui_repr, ignore_string=False):
    obj = ui_repr.curr_var.obj
    if isinstance(obj, DictRepr):
        obj.set_value(x, ignore_string)
    elif isinstance(obj, ObjRepr):
        obj.curr_param.set_value(x, ignore_string)
    else:
        ui_repr.curr_var.set_obj(SimpleRepr(x, ignore_string))


class WrapperRepr:
    def __init__(self, ui_repr):
        self.ui_repr = ui_repr
        self.def_run = "def run():\n"
        self.set_path = "\timport sys\n\tsys.path.insert(0, 'D:\\\\Documents\\\\App Development\\\\ABCDE\\\\ui_specifier\\\\src')\n"
        self.main_entry = "if __name__ == '__main__':\n\trun()"

    def __repr__(self):
        return f"{self.def_run}{self.set_path}{self.ui_repr}{self.main_entry}"


class SimpleRepr:
    def __init__(self, value, ignore_string=False):
        self.value = self.maybe_process_string(value, ignore_string)

    def append(self, value, ignore_string=False):
        self.value.append(self.maybe_process_string(value, ignore_string))

    def maybe_process_string(self, x, ignore_string=False):
        if not ignore_string:
            if isinstance(x, str):
                return f'"{x}"'
        return x

    def __repr__(self):
        if isinstance(self.value, (list, tuple)):
            output = ",".join(self.value)
            return "[{}]".format(output)
        else:
            return f"{self.value}"


class DictRepr:
    def __init__(self, input_dict=None):
        self.dict = {} if input_dict is None else input_dict
        self.curr_key = None

    def add_key(self, key):
        self.dict[key] = None

    def set_curr_key(self, key):
        self.curr_key = key

    def set_value(self, value, ignore_string=False):
        self.dict[self.curr_key] = SimpleRepr(value, ignore_string)

    def __repr__(self):
        return str(self.dict)


class ParamRepr:
    def __init__(self, name, value=None):
        self.name = name
        self.set_value(value)

    def set_value(self, value, ignore_string=False):
        self.value = SimpleRepr(value, ignore_string)

    def __repr__(self):
        return f"{self.name}={self.value}"


class ParamsRepr:
    def __init__(self, param_reprs):
        self.param_reprs = param_reprs

    def add_param(self, name):
        self.param_reprs[name] = ParamRepr(name)

    def get(self, name):
        return self.param_reprs[name]

    def __repr__(self):
        return ",".join([f"{x}" for x in self.param_reprs.values()])


class ImportRepr:
    def __init__(self, modules, attr_name, alias=None):
        self.modules = modules
        self.attr_name = attr_name
        self.alias = alias

    def __repr__(self):
        import_string = f"from {self.modules} import {self.attr_name}"
        if self.alias is not None and self.alias != self.attr_name:
            import_string += f" as {self.alias}"
        import_string += "\n"
        return import_string


class ObjRepr:
    def __init__(self, name, params=None, do_init=True):
        self.name = name
        self.params = ParamsRepr({}) if params is None else params
        self.do_init = do_init
        self.curr_param = None

    def add_param(self, name):
        self.params.add_param(name)

    def set_curr_param(self, name):
        self.curr_param = self.params.get(name)

    def __repr__(self):
        output = f"{self.name}"
        if self.do_init:
            output += f"({self.params})"
        return output


class VarRepr:
    # depth == how nested this variable is
    def __init__(self, name, obj=None, depth=0, do_init=True):
        self.name = name
        self.obj = obj
        self.depth = depth
        self.do_init = do_init

    def set_obj(self, x):
        if isinstance(x, str):
            self.obj = ObjRepr(x, do_init=self.do_init)
        else:
            self.obj = x

    def __repr__(self):
        return f"{self.name}={self.obj}\n"


class UIRepr:
    def __init__(self):
        self.import_reprs = {}
        self.var_reprs = {}
        self.ref_var_reprs = {}
        self.var_name_map = {}
        self.reverse_var_name_map = {}
        self.curr_var = None

    def add_name_to_var_name_map(self, original_name, name):
        if original_name is not None:
            self.var_name_map[original_name] = name
            self.reverse_var_name_map[name] = original_name
        else:
            self.var_name_map[name] = name
            self.reverse_var_name_map[name] = name

    def add_to_var_reprs(self, name, new_var, do_init):
        if do_init:
            self.var_reprs[name] = new_var
        else:
            self.ref_var_reprs[name] = new_var

    def add_var(self, name=None, is_child=False, do_init=True):
        original_full_name = name
        name = self.curr_var.name if name is None else name
        name = get_name_from_full_name(name)
        name = self.create_unique_name(name)
        self.add_name_to_var_name_map(original_full_name, name)
        new_var = VarRepr(name, do_init=do_init)
        self.add_to_var_reprs(name, new_var, do_init)
        if is_child:
            new_var.depth = self.curr_var.depth + 1
            if original_full_name is not None:
                original_name = get_name_from_full_name(original_full_name)
                set_value(name, self, ignore_string=True)
            else:  # if original_full_name is None, then it must be a list
                self.curr_var.obj.append(name, ignore_string=True)
        return name

    def set_curr_var(self, name):
        if name is None:
            self.curr_var = None
        else:
            name = self.var_name_map[name]
            try:
                self.curr_var = self.var_reprs[name]
            except KeyError:
                self.curr_var = self.ref_var_reprs[name]

    def create_unique_name(self, name):
        name = name.replace(" ", "")
        while name in self.import_reprs or name in self.var_reprs:
            name = name + "x"
        return name

    def already_imported(self, attr_name, modules):
        return (
            attr_name in self.import_reprs
            and self.import_reprs[attr_name].modules == modules
        )

    def add_import(self, input_string):
        modules, attr_name = split_attr_from_modules(input_string)
        alias = attr_name
        if not self.already_imported(alias, modules):
            alias = self.create_unique_name(alias)
        self.import_reprs[alias] = ImportRepr(modules, attr_name, alias)
        return alias

    def var_reprs_as_string(self, var_reprs):
        strings = []
        # do child vars in reverse order
        strings.append(
            "".join(reversed([f"\t{x}" for x in var_reprs.values() if x.depth > 0]))
        )
        # then do root vars
        strings.append("".join([f"\t{x}" for x in var_reprs.values() if x.depth == 0]))
        return "".join(strings)

    def __repr__(self):
        strings = []
        # first do imports
        strings.append("".join([f"\t{x}" for x in self.import_reprs.values()]))
        strings.append(self.var_reprs_as_string(self.ref_var_reprs))
        strings.append(self.var_reprs_as_string(self.var_reprs))
        return "".join(strings)


def add_param(ui_repr, name):
    obj = ui_repr.curr_var.obj
    if obj is not None:
        if isinstance(obj, ObjRepr):
            obj.add_param(name)
            obj.set_curr_param(name)
        elif isinstance(obj, DictRepr):
            obj.add_key(name)
            obj.set_curr_key(name)
    else:
        obj = DictRepr({})
        obj.add_key(name)
        obj.set_curr_key(name)
        ui_repr.curr_var.obj = obj


def do_init(name, vars_with_factories, is_child):
    return is_child or name not in vars_with_factories


def create_objects(x, ui_repr, vars_with_factories, is_child=False):
    # x is either an object or a set of parameters
    # if it's an object, then the key is the object name, and the value is another dictionary
    # if it's a set of parameters, then keys are parameter names, and the values are parameter values
    parent_var_name = None
    if ui_repr.curr_var is not None:
        parent_var_name = ui_repr.reverse_var_name_map[ui_repr.curr_var.name]

    if isinstance(x, dict) and len(x) > 0:
        for name, value in x.items():
            if represents_object(name):
                obj_name = ui_repr.add_import(name)
                ui_repr.curr_var.set_obj(obj_name)
            else:
                if ui_repr.curr_var is not None:
                    add_param(ui_repr, name)
                if not is_ref(value):
                    full_name = get_full_name(parent_var_name, name)
                    ui_repr.add_var(
                        full_name,
                        is_child=is_child,
                        do_init=do_init(name, vars_with_factories, is_child),
                    )
                    ui_repr.set_curr_var(full_name)

            create_objects(value, ui_repr, vars_with_factories, is_child=True)
            ui_repr.set_curr_var(parent_var_name)

    elif isinstance(x, (list, tuple)) and len(x) > 0:
        set_value([], ui_repr)
        for sub_x in x:
            name = ui_repr.add_var(is_child=is_child)
            ui_repr.set_curr_var(name)
            create_objects(sub_x, ui_repr, vars_with_factories, is_child=True)
            ui_repr.set_curr_var(parent_var_name)

    elif x not in [None, {}]:
        if is_ref(x):
            ref_var_name = ui_repr.var_name_map[remove_ref(x)]
            if is_simple_ref(x):
                set_value(SimpleRepr(ref_var_name, ignore_string=True), ui_repr)
            elif is_kwargs_ref(x):
                ref_var_kwargs = ui_repr.ref_var_reprs[ref_var_name].obj.params
                ref_var_kwargs = {
                    k: v.value for k, v in ref_var_kwargs.param_reprs.items()
                }
                set_value(ref_var_kwargs, ui_repr)
        else:
            set_value(x, ui_repr)

    ui_repr.set_curr_var(parent_var_name)


def convert_strings(json_dict):
    new_dict = {}
    for k, v in json_dict.items():
        try:
            new_v = ast.literal_eval(v)
        except (ValueError, SyntaxError):
            new_v = v
        if isinstance(new_v, dict):
            new_v = convert_strings(new_v)
        elif isinstance(new_v, (list, tuple)):
            new_v = [convert_strings(x) if isinstance(x, dict) else x for x in new_v]
        new_dict[k] = new_v
    return new_dict


def delete_unused_factories(ui_selections, factory_specs):
    unused_factories = []
    for name, args in factory_specs.items():
        if name not in ui_selections:
            unused_factories.append(name)
    for name in unused_factories:
        del factory_specs[name]


def generate_code(ui_selections, factory_specs, funcs):
    [ui_selections, factory_specs, funcs] = [
        convert_strings(x) for x in [ui_selections, factory_specs, funcs]
    ]
    ui_repr = UIRepr()
    delete_unused_factories(ui_selections, factory_specs)
    vars_with_factories = {k: True for k in factory_specs.keys()}
    if len(ui_selections) > 0:
        create_objects(ui_selections, ui_repr, vars_with_factories)
    if len(factory_specs) > 0:
        create_objects(factory_specs, ui_repr, {})
    if len(funcs) > 0:
        create_objects(funcs, ui_repr, {})

    return WrapperRepr(ui_repr)
