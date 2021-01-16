import importlib

import yaml

from .common_functions import get_the_only_value, merge_dicts
from .constants import REF_KEYWORD, REF_WITH_KWARGS, SEPARATOR


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


# def string_to_attr(input_string):
#     modules, attr_name = split_attr_from_modules(input_string)
#     imported_module = importlib.import_module(modules)
#     return getattr(imported_module, attr_name)


def string_to_attr(input_string):
    modules, attr_name = split_attr_from_modules(input_string)
    return "from {} import {}\n".format(modules, attr_name), attr_name


def represents_object(x):
    return "." in x


def is_ref(x):
    return isinstance(x, str) and (
        x.startswith(REF_KEYWORD) or x.startswith(REF_WITH_KWARGS)
    )


def get_ref(x, refs, ref_kwargs):
    assert x.startswith(REF_WITH_KWARGS) or x.startswith(REF_KEYWORD)
    return_kwargs = x.startswith(REF_WITH_KWARGS)
    var_name = (
        x.replace(REF_WITH_KWARGS, "") if return_kwargs else x.replace(REF_KEYWORD, "")
    )
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


# def create_objects(x, init=True, refs=None, ref_kwargs=None):
#     if isinstance(x, dict) and len(x) > 0:
#         output = {}
#         obj_kwargs = {}
#         for k, v in x.items():
#             if is_ref(v):
#                 obj, obj_kwargs = get_ref(v, refs, ref_kwargs)
#             elif represents_object(k):
#                 obj = string_to_attr(k)
#                 if init:
#                     params = {} if v is None else v
#                     params = create_objects(params, init, refs, ref_kwargs)
#                     if isinstance(params, (list, tuple)):
#                         params = {k: params}
#                     obj = obj(**params)
#             else:
#                 obj = create_objects(v, init, refs, ref_kwargs)
#             if not represents_object(k):
#                 output[k] = obj
#                 output = merge_dicts(output, obj_kwargs)
#             else:
#                 return obj
#         return output
#     elif isinstance(x, (list, tuple)) and len(x) > 0:
#         return [create_objects(sub_x, init, refs, ref_kwargs) for sub_x in x]
#     else:
#         if is_ref(x):
#             x, _ = get_ref(x, refs, ref_kwargs)
#         return x


def obj_creation_string(var_name, obj_name, params, init):
    if init:
        return "{}={}({})\n".format(var_name, obj_name, params)
    return "{}={}\n".format(var_name, obj_name)


def create_objects(x, init=True, refs=None, ref_kwargs=None, var_name=None):
    if isinstance(x, dict) and len(x) > 0:
        output = {}
        obj_kwargs = {}
        for k, v in x.items():
            print("k,v", k, v)
            if is_ref(v):
                obj, obj_ref, obj_kwargs = get_ref(v, refs, ref_kwargs)
                print("obj\n", obj)
                print("obj_ref\n", obj_ref)
                print("obj_kwargs\n", obj_kwargs)
            elif represents_object(k):
                obj, obj_name = string_to_attr(k)
                if init:
                    params = {} if v is None else v
                    params = create_objects(params, init, refs, ref_kwargs)
                    if isinstance(params, (list, tuple)):
                        params = {k: params}
                    param_string = ""
                    for param_name, param_value in params.items():
                        param_string += "{}={},".format(param_name, param_value)
                    if refs is not None and var_name in refs:
                        obj += refs[var_name]
                    obj += obj_creation_string(
                        var_name, obj_name, param_string, init=init
                    )
                else:
                    obj += obj_creation_string(var_name, obj_name, {}, init=init)
                print("obj\n", obj)
            else:
                obj = create_objects(v, init, refs, ref_kwargs)
                print("obj\n", obj)
            if not represents_object(k):
                output[k] = obj
                output = merge_dicts(output, obj_kwargs)
                print("output", output)
            else:
                return obj
        return output
    elif isinstance(x, (list, tuple)) and len(x) > 0:
        return [create_objects(sub_x, init, refs, ref_kwargs) for sub_x in x]
    else:
        if is_ref(x):
            x, _ = get_ref(x, refs, ref_kwargs)
        return x


def run(objs, funcs):
    for F, args in funcs.items():
        collected_kwargs = create_objects(args, refs=objs)
        string_to_attr(F)(**collected_kwargs)


def create_objs_from_ui_selections(ui_selections, factory_specs):
    objs = {}
    remaining = {k: True for k in ui_selections}
    curr_length = len(remaining)
    prev_length = curr_length
    exceptions = []
    while curr_length > 0:
        for name, args in ui_selections.items():
            if name in remaining:
                try:
                    objs[name] = create_objects(
                        args, init=name not in factory_specs, refs=objs, var_name=name
                    )
                    del remaining[name]
                except KeyError as e:
                    exceptions.append((name, e))
        prev_length = curr_length
        curr_length = len(remaining)
        if prev_length == curr_length:
            raise KeyError(exceptions)
    for name, args in factory_specs.items():
        objs[name] = create_objects(
            args, refs=objs, ref_kwargs=ui_selections, var_name=name
        )
    return objs
