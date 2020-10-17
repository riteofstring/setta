import inspect


def get_init_arguments(input_obj):
    obj_stack = [input_obj]
    init_arguments = {}
    while len(obj_stack) > 0:
        curr_obj = obj_stack.pop()
        obj_stack += list(curr_obj.__bases__)
        signature = inspect.signature(curr_obj)
        for k, v in signature.parameters.items():
            init_arguments[k] = v
    return init_arguments


def parameter_has_default(parameter):
    return parameter.default != inspect.Parameter.empty


def merge_dicts(x, y):
    z = x.copy()
    for k, v in y.items():
        z[k] = v
    return z
