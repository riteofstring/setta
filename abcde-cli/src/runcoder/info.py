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


import yaml
import importlib
import inspect

def get_args(x):
    x = x.split(".")
    module = importlib.import_module(".".join(x[:-1]))
    fn = getattr(module, x[-1])
    print(f"\n\n\n**** {fn} ****")
    print(inspect.signature(fn).parameters)




def _info(yaml_path):
    with open(yaml_path, "r") as f:
        specs = yaml.safe_load(f)
    for x in specs:
        get_args(x)