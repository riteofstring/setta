import builtins
import inspect


def is_class_or_function(x):
    return inspect.isclass(x) or inspect.isfunction(x)


def add_signature_to_dict(input_obj, input_dict):
    try:
        signature = inspect.signature(input_obj)
    except ValueError:
        return
    for k, v in signature.parameters.items():
        input_dict[k] = v


def get_args(input_obj):
    init_arguments = {}
    if inspect.isclass(input_obj):
        obj_stack = [input_obj]
        while len(obj_stack) > 0:
            curr_obj = obj_stack.pop()
            obj_stack += list(curr_obj.__bases__)
            add_signature_to_dict(curr_obj, init_arguments)
    elif inspect.isfunction(input_obj):
        add_signature_to_dict(input_obj, init_arguments)
    else:
        raise TypeError("input_obj to get_args must be a class or function")
    return init_arguments


def parameter_has_default(parameter):
    return parameter.default != inspect.Parameter.empty


def merge_dicts(x, y):
    z = x.copy()
    for k, v in y.items():
        if (k in z) and isinstance(z[k], dict) and isinstance(v, dict):
            z[k] = merge_dicts(z[k], v)
        else:
            z[k] = v
    return z


def type_to_str(x):
    if inspect.isclass(x):
        x = x.__name__
    return str(x)


def str_to_builtin_type(x):
    return getattr(builtins, x)


def get_the_only_key(x):
    return list(x.keys())[0]


def get_the_only_value(x):
    return x[get_the_only_key(x)]


def class_info_to_module_info(info, module_name):
    return {module_name: {info.name: info.as_dict()}}
