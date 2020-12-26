import yaml
import importlib
from .constants import REF_KEYWORD, SEPARATOR
from .common_functions import merge_dicts, get_the_only_value


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
    return isinstance(x, str) and x.startswith(REF_KEYWORD)


def get_ref(x, refs, ref_kwargs):
    without_keyword = x.replace(REF_KEYWORD, "")
    search_terms = without_keyword.split(SEPARATOR)
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
    return out_refs, out_kwargs


def create_objects(x, init=True, refs=None, ref_kwargs=None):
    if isinstance(x, dict) and len(x) > 0:
        output = {}
        obj_kwargs = {}
        for k, v in x.items():
            if is_ref(v):
                obj, obj_kwargs = get_ref(v, refs, ref_kwargs)
            elif represents_object(k):
                obj = string_to_attr(k)
                if init:
                    params = {} if v is None else v
                    params = create_objects(params, init, refs, ref_kwargs)
                    if isinstance(params, (list, tuple)):
                        params = {k: params}
                    obj = obj(**params)
            else:
                obj = create_objects(v, init, refs, ref_kwargs)
            if not represents_object(k):
                output[k] = obj
                output = merge_dicts(output, obj_kwargs)
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
                        args, init=name not in factory_specs, refs=objs
                    )
                    del remaining[name]
                except KeyError as e:
                    exceptions.append((name, e))
        prev_length = curr_length
        curr_length = len(remaining)
        if prev_length == curr_length:
            raise KeyError(exceptions)
    for name, args in factory_specs.items():
        objs[name] = create_objects(args, refs=objs, ref_kwargs=ui_selections)
    return objs
