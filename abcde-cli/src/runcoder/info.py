import importlib
import inspect
import json
import uuid

import yaml

from .constants import CALLABLE, COLLECTION, PARAMETER


class KeyAlreadyExists(Exception):
    pass


# https://stackoverflow.com/a/73143659
class InfoDict(dict):
    def __setitem__(self, key, value):
        if key not in self:
            super().__setitem__(key, value)


def id_as_key(info_dict):
    return {info["id"]: info for info in info_dict.values()}


def construct_path(import_from, import_this):
    return f"{import_from}.{import_this}" if import_this else import_from


def module_info(import_from, import_this, version, output):
    path = construct_path(import_from, import_this)
    name = import_this if import_this else import_from
    id = str(uuid.uuid4())
    info = {
        "id": id,
        "name": name,
        "version": version,
        "defaultVal": None,
        "type": "module",
        "description": None,
        "rcType": COLLECTION,
        "path": path,
        "children": [],
    }
    output[path] = info


def callable_info(obj, import_from, import_this, version, output):
    path = construct_path(import_from, import_this)
    id = str(uuid.uuid4())
    info = {
        "id": id,
        "name": import_this,
        "version": version,
        "defaultVal": None,
        "type": "callable",
        "description": None,
        "rcType": CALLABLE,
        "path": path,
        "children": [],
    }
    output[path] = info
    for v in inspect.signature(obj).parameters.values():
        parameter_info(path, v, version, output)


def parameter_info(obj_path, param, version, output):
    path = f"{obj_path}.{param.name}"
    id = str(uuid.uuid4())
    info = {
        "id": id,
        "name": param.name,
        "version": version,
        "defaultVal": param.default,
        "type": str(param.annotation),
        "description": None,
        "rcType": PARAMETER,
        "path": path,
        "children": [],
    }
    output[path] = info


def get_args(path, version, output):
    xs = path.split(".")
    if len(xs) == 1:
        import_from, import_this = xs[0], None
    else:
        import_from, import_this = ".".join(xs[:-1]), xs[-1]

    obj = importlib.import_module(import_from)
    if import_this:
        obj = getattr(obj, import_this)

    if inspect.ismodule(obj):
        module_info(import_from, import_this, version, output)
    elif inspect.isclass(obj) or inspect.isfunction(obj):
        callable_info(obj, import_from, import_this, version, output)


def get_args_for_all_subpaths(x, output):
    xs = x.split(".")
    version = importlib.metadata.version(xs[0])
    for i in range(1, len(xs) + 1):
        get_args(".".join(xs[:i]), version, output)


def _info(yaml_path, output_path):
    with open(yaml_path, "r") as f:
        specs = yaml.safe_load(f)
    output = InfoDict()
    for x in specs:
        get_args_for_all_subpaths(x, output)

    output = id_as_key(output)

    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
