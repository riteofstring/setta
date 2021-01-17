import importlib
import string
from collections import defaultdict

import yaml

from .common_functions import get_the_only_key, get_the_only_value, merge_dicts
from .constants import REF_KEYWORD, KWARGS_KEYWORD, SEPARATOR


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

# class DictRepr:
#     def __init__(self, input_dict=None):
#         self.dict = {} if input_dict is None else input_dict

#     # def add_key_value(self, key, value):
#     #     self.dict[key] = SimpleRepr(value)

#     def __repr__(self):
#         return self.dict


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
    import_reprs = {}
    var_reprs = {}
    curr_var = None

    def add_var(self, name=None, is_child=False, do_init=True):
        original_name = name
        name = self.curr_var.name if name is None else name
        name = self.create_unique_name(name)
        new_var = VarRepr(name, do_init=do_init)
        self.var_reprs[name] = new_var
        if is_child:
            new_var.depth = self.curr_var.depth + 1
            if original_name is not None:
                self.curr_var.obj.params.get(original_name).set_value(
                    name, ignore_string=True
                )
            else:  # if original_name is None, then it must be a list
                self.curr_var.obj.append(name, ignore_string=True)
        return name

    def set_curr_var(self, name):
        if name is None:
            self.curr_var = None
        else:
            self.curr_var = self.var_reprs[name]

    def create_unique_name(self, name):
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
        self.import_reprs[attr_name] = ImportRepr(modules, attr_name, alias)
        return attr_name

    def __repr__(self):
        strings = []
        # first do imports
        strings.append("".join([f"{x}" for x in self.import_reprs.values()]))
        # then do child vars in reverse order
        strings.append(
            "".join(reversed([f"{x}" for x in self.var_reprs.values() if x.depth > 0]))
        )
        # then do root vars
        strings.append(
            "".join([f"{x}" for x in self.var_reprs.values() if x.depth == 0])
        )
        return "".join(strings)


def set_value(x, ui_repr):
    try:
        ui_repr.curr_var.obj.curr_param.set_value(x)
    except AttributeError:
        ui_repr.curr_var.set_obj(SimpleRepr(x))


def do_init(name, vars_with_factories, is_child):
    return is_child or name not in vars_with_factories


def create_objects(x, ui_repr, vars_with_factories, is_child=False):
    # x is either an object or a set of parameters
    # if it's an object, then the key is the object name, and the value is another dictionary
    # if it's a set of parameters, then keys are parameter names, and the values are parameter values
    parent_var_name = None
    if ui_repr.curr_var is not None:
        parent_var_name = ui_repr.curr_var.name

    if isinstance(x, dict) and len(x) > 0:
        for name, value in x.items():
            if represents_object(name):
                obj_name = ui_repr.add_import(name)
                ui_repr.curr_var.set_obj(obj_name)
            else:
                if ui_repr.curr_var is not None:
                    ui_repr.curr_var.obj.add_param(name)
                    ui_repr.curr_var.obj.set_curr_param(name)
                if not is_ref(value):
                    returned_name = ui_repr.add_var(
                        name,
                        is_child=is_child,
                        do_init=do_init(name, vars_with_factories, is_child),
                    )
                    ui_repr.set_curr_var(returned_name)

            create_objects(value, ui_repr, vars_with_factories, is_child=True)
            ui_repr.set_curr_var(parent_var_name)

    elif isinstance(x, (list, tuple)) and len(x) > 0:
        set_value([], ui_repr)
        for sub_x in x:
            name = ui_repr.add_var(is_child=is_child)
            ui_repr.set_curr_var(name)
            create_objects(sub_x, ui_repr, vars_with_factories, is_child=True)
            ui_repr.set_curr_var(parent_var_name)

    elif x is not None:
        if is_ref(x):
            ref_var_name = remove_ref(x)
            if is_simple_ref(x):
                set_value(SimpleRepr(ref_var_name, ignore_string=True), ui_repr)
            elif is_kwargs_ref(x):
                ref_var_kwargs = ui_repr.var_reprs[ref_var_name].obj.params
                ref_var_kwargs = {k:v.value for k,v in ref_var_kwargs.param_reprs.items()}
                set_value(ref_var_kwargs, ui_repr)
        else:
            set_value(x, ui_repr)

    ui_repr.set_curr_var(parent_var_name)


def delete_unused_factories(ui_selections, factory_specs):
    unused_factories = []
    for name, args in factory_specs.items():
        if name not in ui_selections:
            unused_factories.append(name)
    for name in unused_factories:
        del factory_specs[name]


def generate_code(ui_selections, factory_specs):
    ui_repr = UIRepr()
    delete_unused_factories(ui_selections, factory_specs)
    vars_with_factories = {k: True for k in factory_specs.keys()}
    if len(ui_selections) > 0:
        create_objects(ui_selections, ui_repr, vars_with_factories)
    if len(factory_specs) > 0:
        create_objects(factory_specs, ui_repr, {})

    return ui_repr


# class VarRepr:
#     def __init__(self, var_name):
#         self.var_name = var_name

#     def __repr__(self):
#         return self.var_name


# class UIRepr:
#     imports = {}
#     vars_to_objs = {}
#     original_vars_to_unique = {}
#     implicit_refs = defaultdict(list)
#     saved_string_state = ""

#     def get_implicit_refs(self, original_var_name, depth=0, max_depth=1):
#         # key = self.original_vars_to_unique[key]
#         output = []
#         for var_name, full_obj_name in self.implicit_refs[original_var_name]:
#             # k = self.original_vars_to_unique[k]
#             if var_name in self.vars_to_objs:
#                 output.append((var_name, full_obj_name))
#             if depth < max_depth:
#                 output.extend(
#                     self.get_implicit_refs(
#                         var_name, depth=depth + 1, max_depth=max_depth
#                     )
#                 )
#         return output

#     def replace_implicit_refs_helper(self, params, var_name, full_obj_name):
#         for name, value in params.items():
#             if isinstance(value, dict) and get_the_only_key(value) == full_obj_name:
#                 params[name] = VarRepr(var_name)
#                 return
#             elif isinstance(value, (list, tuple)):
#                 for i, v in enumerate(value):
#                     if isinstance(v, dict) and get_the_only_key(v) == full_obj_name:
#                         value[i] = VarRepr(var_name)
#                         return

#     def replace_implicit_refs(self, original_var_name, implicit_refs):
#         objs = self.get_objs(original_var_name)
#         params = objs["params"]
#         if len(params) > 0:
#             for ir, full_obj_name in implicit_refs:
#                 self.replace_implicit_refs_helper(params, ir, full_obj_name)

#     def get_objs(self, original_var_name):
#         var_name = self.original_vars_to_unique[original_var_name]
#         return self.vars_to_objs[var_name]

#     def update_ref(self, parent_var_name, parent_key, original_ref_var_name):
#         assert original_ref_var_name.startswith(REF_KEYWORD)
#         ref_var_name = original_ref_var_name.replace(REF_KEYWORD, "")
#         parent_objs = self.get_objs(parent_var_name)
#         self.update_params(parent_objs, self.get_objs(ref_var_name)["params"])
#         parent_objs["params"][parent_key] = self.original_vars_to_unique[ref_var_name]
#         parent_objs["printed"] = False

#     def already_imported(self, attr_name, modules):
#         return (
#             attr_name in self.imports and self.imports[attr_name]["modules"] == modules
#         )

#     def create_unique_child_name(self, name, full_obj_name):
#         new_name = "{}_{}".format(name, len(self.implicit_refs[name]))
#         self.implicit_refs[name].append((new_name, full_obj_name))
#         return new_name

#     def create_unique_name(self, name):
#         while name in self.imports or name in self.vars_to_objs:
#             name = name + "x"
#         return name

#     def set_imports(self, input_string):
#         modules, original_attr_name = split_attr_from_modules(input_string)
#         attr_name = original_attr_name
#         if not self.already_imported(attr_name, modules):
#             attr_name = self.create_unique_name(attr_name)
#             import_string = "from {} import {}".format(modules, original_attr_name)
#             if attr_name != original_attr_name:
#                 import_string += " as {}".format(attr_name)
#             import_string += "\n"
#             self.imports[attr_name] = {
#                 "modules": modules,
#                 "string": import_string,
#                 "printed": False,
#             }
#         return attr_name

#     def param_string(self, params):
#         param_string = ["" for _ in range(len(params))]
#         for i, (param_name, param_value) in enumerate(params.items()):
#             param_string[i] = "{}={},".format(param_name, param_value)
#         return "".join(param_string)

#     def update_params(self, objs, new_params):
#         old_params = objs["params"]
#         objs["params"] = merge_dicts(new_params, old_params)

#     def set_vars_to_objs(
#         self, original_var_name, obj_name, init, params, is_child, full_obj_name
#     ):
#         if is_child:
#             original_var_name = self.create_unique_child_name(
#                 original_var_name, full_obj_name
#             )
#         if original_var_name not in self.original_vars_to_unique:
#             var_name = self.create_unique_name(original_var_name)
#             self.original_vars_to_unique[original_var_name] = var_name
#             self.vars_to_objs[var_name] = {
#                 "name": obj_name,
#                 "init": init,
#                 "params": params,
#                 "printed": False,
#             }
#         else:
#             objs = self.get_objs(original_var_name)
#             objs["name"] = obj_name
#             objs["init"] = init
#             self.update_params(objs, params)

#         return original_var_name

#     def num_not_printed(self, x):
#         return len([1 for v in x.values() if not v["printed"]])

#     def update_saved_string_state(self):
#         total_length = self.num_not_printed(self.imports) + self.num_not_printed(
#             self.vars_to_objs
#         )
#         output = ["" for _ in range(total_length)]
#         i = 0
#         for v in self.imports.values():
#             if not v["printed"]:
#                 output[i] = v["string"]
#                 i += 1
#                 v["printed"] = True
#         for k, v in self.vars_to_objs.items():
#             if not v["printed"]:
#                 name, init, params = v["name"], v["init"], v["params"]
#                 if init:
#                     output[i] = "{}={}({})\n".format(k, name, self.param_string(params))
#                 else:
#                     output[i] = "{}={}\n".format(k, name)
#                 i += 1
#                 v["printed"] = True
#         self.saved_string_state += "".join(output)


# def create_objs_from_ui_selections(ui_selections, factory_specs):
#     remaining = {k: True for k in ui_selections}
#     curr_length = len(remaining)
#     prev_length = curr_length
#     exceptions = []
#     ui_repr = UIRepr()
#     while curr_length > 0:
#         for name, args in ui_selections.items():
#             if name in remaining:
#                 # try:
#                 create_objects(
#                     args,
#                     init=name not in factory_specs,
#                     var_name=name,
#                     ui_repr=ui_repr,
#                 )
#                 del remaining[name]
#                 # except KeyError as e:
#                 #     exceptions.append((name, e))
#         prev_length = curr_length
#         curr_length = len(remaining)
#         if prev_length == curr_length:
#             raise KeyError(exceptions)

#     ui_repr.update_saved_string_state()

#     for name, args in factory_specs.items():
#         if name in ui_selections:
#             create_objects(args, init=True, var_name=name, ui_repr=ui_repr)

#     ui_repr.update_saved_string_state()

#     print("ui_repr\n")
#     print(ui_repr.saved_string_state)

#     # print("\nui_repr.vars_to_objs\n")
#     # print(ui_repr.vars_to_objs)

#     print("\nui_repr.implicit_refs\n")
#     print(ui_repr.implicit_refs)

#     return ui_repr.saved_string_state
