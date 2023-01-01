# import argparse
# from inspect import getmembers, isfunction, ismodule, isclass, signature
# from pprint import pprint
# import importlib
# import uuid


# def get_code_info(items, parent_path, depth):
#     output = {}
#     for (name, obj) in items:
#         id = str(uuid.uuid4())
#         path = f"{parent_path}.{name}"
#         output[id] = {"id": id, "name": name, "path": path}
#         output.update(get_children(obj, path, depth+1))
#     return output


# def get_children(x, path, depth):
#     if depth == 2:
#         return {}
#     output = {}
#     if isclass(x):
#         get_code_info(signature(x).parameters, path, 100)
#     else:
#         for predicate in [isfunction, ismodule, isclass]:
#             output.update(get_code_info(getmembers(x, predicate), path, depth))
#     return output


# def main():
#     module_name = "torch.nn"
#     module = importlib.import_module(module_name)
#     output = get_children(module, module_name, 0)
#     pprint(len(output))


# if __name__ == "__main__":
#     parser = argparse.ArgumentParser(allow_abbrev=False)
#     main()


import importlib
import inspect
import uuid

import yaml

from .constants import PARAMETER
from pprint import pprint


def get_args(x):
    xs = x.split(".")
    module = importlib.import_module(".".join(xs[:-1]))
    fn = getattr(module, xs[-1])
    output = {}
    for v in inspect.signature(fn).parameters.values():
        id = str(uuid.uuid4())
        output[id] = {
            "id": id,
            "name": v.name,
            "version": None,
            "defaultVal": v.default,
            "type": v.annotation,
            "description": None,
            "rcType": PARAMETER,
            "inCodeParentId": None,
            "path": f"{x}.{v.name}",
            "children": [],
        }

    pprint(output)


def _info(yaml_path):
    with open(yaml_path, "r") as f:
        specs = yaml.safe_load(f)
    for x in specs:
        get_args(x)
