import yaml
import importlib
from ..registration.global_ref_dict import GLOBAL_REF_DICT
from .constants import REF_KEYWORD, DO_NOT_INIT_KEYWORD


def load_yaml(fname):
    with open(fname, "r") as f:
        loaded_yaml = yaml.safe_load(f)
    return loaded_yaml


def get_functions_to_run(config):
    return list(config.keys())


def string_to_attr(input_string):
    modules = input_string.split(".")
    attr_name = modules.pop()
    modules = ".".join(modules)
    imported_module = importlib.import_module(modules)
    return getattr(imported_module, attr_name)


def get_func_dict(config):
    return {x: string_to_attr(x) for x in get_functions_to_run(config)}


def represents_object(x):
    return "." in x


def create_objects(x):
    if isinstance(x, dict) and len(x) > 0:
        output = {}
        for k, v in x.items():
            if isinstance(v, str) and v.startswith(REF_KEYWORD):
                obj = GLOBAL_REF_DICT[v.replace(REF_KEYWORD, "")]
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
        return x


def run(config):
    funcs = get_func_dict(config)
    for func_name, F in funcs.items():
        collected_args = {}
        for name, args in config[func_name].items():
            created_obj = create_objects(args)
            collected_args[name] = created_obj
        F(**collected_args)
