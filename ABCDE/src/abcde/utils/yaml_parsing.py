import yaml
import importlib
from ..registration.global_dicts import GLOBAL_REF_DICT
from .constants import REF_KEYWORD, DO_NOT_INIT_KEYWORD


def load_yaml(fname):
    with open(fname, "r") as f:
        loaded_yaml = yaml.safe_load(f)
    return loaded_yaml


def keys_as_list(config):
    return list(config.keys())


def string_to_attr(input_string):
    modules = input_string.split(".")
    attr_name = modules.pop()
    modules = ".".join(modules)
    imported_module = importlib.import_module(modules)
    return getattr(imported_module, attr_name)


def get_func_dict(config):
    order = sorted([int(x) for x in keys_as_list(config)])
    return {i: {x: string_to_attr(x) for x in keys_as_list(config[i])} for i in order}


def represents_object(x):
    return "." in x


def is_ref(x):
    return isinstance(x, str) and x.startswith(REF_KEYWORD)


def get_ref(x):
    return GLOBAL_REF_DICT[x.replace(REF_KEYWORD, "")]


def create_objects(x):
    if isinstance(x, dict) and len(x) > 0:
        output = {}
        for k, v in x.items():
            if is_ref(v):
                obj = get_ref(v)
            elif represents_object(k):
                obj = string_to_attr(k)
                if v != DO_NOT_INIT_KEYWORD:
                    params = {} if v is None else v
                    params = create_objects(params)
                    if isinstance(params, (list, tuple)):
                        params = {k: params}
                    obj = obj(**params)
            else:
                obj = create_objects(v)
            if not represents_object(k):
                output[k] = obj
            else:
                return obj
        return output
    elif isinstance(x, (list, tuple)) and len(x) > 0:
        return [create_objects(sub_x) for sub_x in x]
    else:
        if is_ref(x):
            x = get_ref(x)
        return x


def run(config):
    ordered_funcs = get_func_dict(config)
    for i, funcs in ordered_funcs.items():
        for func_name, F in funcs.items():
            collected_args = {}
            for name, args in config[i][func_name].items():
                created_obj = create_objects(args)
                collected_args[name] = created_obj
            F(**collected_args)
