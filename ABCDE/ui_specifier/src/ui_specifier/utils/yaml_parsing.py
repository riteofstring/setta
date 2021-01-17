import importlib
import string
from collections import defaultdict

import yaml

from .common_functions import get_the_only_value, merge_dicts
from .constants import REF_KEYWORD, SEPARATOR

# class ObjRepr:
#     count = 0
#     string = ""
#     value = []


# def create_objects(x, init=True, refs=None, ref_kwargs=None, var_name=None, obj_repr=None):
#     if obj_repr.count > 0:
#         var_name = "{}_{}".format(var_name.rstrip("_"+string.digits), obj_repr.count)
#     obj_repr.count += 1
#     if isinstance(x, dict) and len(x) > 0:
#         output = {}
#         obj_kwargs = {}
#         for k, v in x.items():
#             if is_ref(v):
#                 obj, obj_ref, obj_kwargs = get_ref(v, refs, ref_kwargs)
#             elif represents_object(k):
#                 obj, obj_name = string_to_attr(k)
#                 if init:
#                     params = {} if v is None else v
#                     params = create_objects(params, init, refs, ref_kwargs, var_name=var_name, obj_repr=obj_repr)
#                     if isinstance(params, (list, tuple)):
#                         params = {k: params}
#                     params = param_string(params)
#                     if refs is not None and var_name in refs:
#                         obj += refs[var_name]
#                     obj += obj_repr.string
#                     obj += obj_creation_string(
#                         var_name, obj_name, params, init=init
#                     )
#                 else:
#                     obj += obj_creation_string(var_name, obj_name, {}, init=init)
#             else:
#                 obj = create_objects(v, init, refs, ref_kwargs, var_name=var_name, obj_repr=obj_repr)
#             if not represents_object(k):
#                 output[k] = obj
#                 output = merge_dicts(output, obj_kwargs)
#             else:
#                 obj_repr.string += obj
#                 return obj
#         return output
#     elif isinstance(x, (list, tuple)) and len(x) > 0:
#         return [create_objects(sub_x, init, refs, ref_kwargs, var_name=var_name, obj_repr=obj_repr) for sub_x in x]
#     else:
#         if is_ref(x):
#             x, _, _ = get_ref(x, refs, ref_kwargs)
#         obj_repr.value.append(x)
#         return x


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


def is_ref(x):
    return isinstance(x, str) and (x.startswith(REF_KEYWORD))


def get_ref(x, refs, ref_kwargs):
    assert x.startswith(REF_KEYWORD)
    var_name = x.replace(REF_KEYWORD, "")
    search_terms = var_name.split(SEPARATOR)
    out_refs = refs
    out_kwargs = ref_kwargs
    for i, st in enumerate(search_terms):
        out_refs = out_refs[st]
        if out_kwargs is not None:
            out_kwargs = out_kwargs[st]
            if i == len(search_terms) - 1:
                out_kwargs = get_the_only_value(out_kwargs)
    if out_kwargs is None:
        out_kwargs = {}
    return var_name, out_refs, out_kwargs


def obj_creation_string(var_name, obj_name, params, init):
    if init:
        return "{}={}({})\n".format(var_name, obj_name, params)
    return "{}={}\n".format(var_name, obj_name)


def create_objects(x, init=True, var_name=None, ui_repr=None):
    if isinstance(x, dict) and len(x) > 0:
        for k, v in x.items():
            print("k,v", k, v)
            if represents_object(k):
                obj_name = ui_repr.set_imports(k)
                params = {} if v is None else v
                create_objects(
                    params,
                    init,
                    var_name=var_name,
                    ui_repr=ui_repr,
                )
                ui_repr.set_vars_to_objs(var_name, obj_name, init, params)
            elif is_ref(v):
                ui_repr.update_ref(var_name, k, v)

    elif isinstance(x, (list, tuple)) and len(x) > 0:
        print("is list or tuple", x)
    else:
        print("is something else", x)


class UIRepr:
    imports = {}
    vars_to_objs = {}
    original_vars_to_unique = {}
    saved_string_state = ""

    def get_objs(self, original_var_name):
        var_name = self.original_vars_to_unique[original_var_name]
        return self.vars_to_objs[var_name]

    def update_ref(self, parent_var_name, parent_key, original_ref_var_name):
        assert original_ref_var_name.startswith(REF_KEYWORD)
        ref_var_name = original_ref_var_name.replace(REF_KEYWORD, "")
        parent_objs = self.get_objs(parent_var_name)
        self.update_params(parent_objs, self.get_objs(ref_var_name)["params"])
        parent_objs["params"][parent_key] = ref_var_name
        parent_objs["printed"] = False

    def already_imported(self, attr_name, modules):
        return (
            attr_name in self.imports and self.imports[attr_name]["modules"] == modules
        )

    def create_unique_name(self, zzz):
        while zzz in self.imports or zzz in self.vars_to_objs:
            zzz = zzz + "x"
        return zzz

    def set_imports(self, input_string):
        modules, original_attr_name = split_attr_from_modules(input_string)
        attr_name = original_attr_name
        if not self.already_imported(attr_name, modules):
            attr_name = self.create_unique_name(attr_name)
            import_string = "from {} import {}".format(modules, original_attr_name)
            if attr_name != original_attr_name:
                import_string += " as {}".format(attr_name)
            import_string += "\n"
            self.imports[attr_name] = {
                "modules": modules,
                "string": import_string,
                "printed": False,
            }
        return attr_name

    def param_string(self, params):
        param_string = ["" for _ in range(len(params))]
        for i, (param_name, param_value) in enumerate(params.items()):
            param_string[i] = "{}={},".format(param_name, param_value)
        return "".join(param_string)

    def update_params(self, objs, new_params):
        old_params = objs["params"]
        objs["params"] = merge_dicts(new_params, old_params)

    def set_vars_to_objs(self, original_var_name, obj_name, init, params):
        if original_var_name not in self.original_vars_to_unique:
            var_name = self.create_unique_name(original_var_name)
            self.original_vars_to_unique[original_var_name] = var_name
            self.vars_to_objs[var_name] = {
                "name": obj_name,
                "init": init,
                "params": params,
                "printed": False,
            }
        else:
            objs = self.get_objs(original_var_name)
            objs["name"] = obj_name
            objs["init"] = init
            self.update_params(objs, params)

    def num_not_printed(self, x):
        return len([1 for v in x.values() if not v["printed"]])

    def update_saved_string_state(self):
        total_length = self.num_not_printed(self.imports) + self.num_not_printed(
            self.vars_to_objs
        )
        output = ["" for _ in range(total_length)]
        i = 0
        for v in self.imports.values():
            if not v["printed"]:
                output[i] = v["string"]
                i += 1
                v["printed"] = True
        for k, v in self.vars_to_objs.items():
            if not v["printed"]:
                name, init, params = v["name"], v["init"], v["params"]
                if init:
                    output[i] = "{}={}({})\n".format(k, name, self.param_string(params))
                else:
                    output[i] = "{}={}\n".format(k, name)
                i += 1
                v["printed"] = True
        self.saved_string_state += "".join(output)


def run(objs, funcs):
    for F, args in funcs.items():
        collected_kwargs = create_objects(args, refs=objs)
        string_to_attr(F)(**collected_kwargs)


def create_objs_from_ui_selections(ui_selections, factory_specs):
    remaining = {k: True for k in ui_selections}
    curr_length = len(remaining)
    prev_length = curr_length
    exceptions = []
    ui_repr = UIRepr()
    while curr_length > 0:
        for name, args in ui_selections.items():
            if name in remaining:
                try:
                    create_objects(
                        args,
                        init=name not in factory_specs,
                        var_name=name,
                        ui_repr=ui_repr,
                    )
                    del remaining[name]
                except KeyError as e:
                    exceptions.append((name, e))
        prev_length = curr_length
        curr_length = len(remaining)
        if prev_length == curr_length:
            raise KeyError(exceptions)

    ui_repr.update_saved_string_state()

    for name, args in factory_specs.items():
        create_objects(args, init=True, var_name=name, ui_repr=ui_repr)

    ui_repr.update_saved_string_state()

    print("ui_repr\n")
    print(ui_repr.saved_string_state)

    return ui_repr.saved_string_state
