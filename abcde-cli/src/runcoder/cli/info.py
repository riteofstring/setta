import importlib
import inspect
import os
import pathlib
import sys
import uuid

import yaml

from ..utils.constants import CALLABLE, COLLECTION, PARAMETER


class InfoDict:
    def __init__(self, yaml_path):
        from runcoder_test.load_test_data import load_global_code_info

        self.yaml_name = pathlib.Path(yaml_path).stem
        self.output = {}
        self.db = {k: path_as_key(v) for k, v in load_global_code_info().items()}

    def child_path_condition(self, parent_path, child_path):
        return (
            parent_path
            and child_path
            and child_path.startswith(parent_path)
            and len(child_path.split(".")) == len(parent_path.split(".")) + 1
        )

    def get_inCodeParentId(self, parent_source, child):
        return next(
            (
                p["id"]
                for p in parent_source.values()
                if self.child_path_condition(p["path"], child["path"])
            ),
            None,
        )

    def finalize(self):
        self.output = id_as_key(self.output)
        self.db = {k: id_as_key(v) for k, v in self.db.items()}

        for v in self.output.values():
            v["children"] = [
                c["id"]
                for c in self.output.values()
                if self.child_path_condition(v["path"], c["path"])
            ]
            v["inCodeParentId"] = self.get_inCodeParentId(self.output, v)

        for v in self.output.values():
            if v["inCodeParentId"]:
                continue
            for db_val in self.db.values():
                id = self.get_inCodeParentId(db_val, v)
                if id:
                    v["inCodeParentId"] = id
                    db_val[id]["children"].append(v["id"])
                    break

    def is_in_db(self, key):
        for v in self.db.values():
            if key in v:
                return True
        return False

    def __setitem__(self, key, value):
        if not self.is_in_db(key) and key not in self.output:
            self.output[key] = value

    def save(self):
        from runcoder_test.load_test_data import write_ts_file

        all_paths = set(self.db.keys())
        output_folder = pathlib.Path(list(self.db.keys())[0]).parent
        all_paths.add((output_folder / self.yaml_name).with_suffix(".ts"))
        for p in all_paths:
            if p.stem == self.yaml_name:
                if p in self.db:
                    curr_output = {**self.db[p], **self.output}
                else:
                    curr_output = self.output
            else:
                curr_output = self.db[p]
            write_ts_file(curr_output, p)


def id_as_key(info_dict):
    return {info["id"]: info for info in info_dict.values()}


def path_as_key(info_dict):
    return {info["path"]: info for info in info_dict.values()}


def construct_path(import_from, import_this):
    return f"{import_from}.{import_this}" if import_this else import_from


def get_info(**kwargs):
    return {
        "id": str(uuid.uuid4()),
        "name": None,
        "version": None,
        "defaultVal": None,
        "type": None,
        "description": None,
        "rcType": None,
        "inCodeParentId": None,
        "path": None,
        "children": [],
        "returnType": None,
        **kwargs,
    }


def module_info(import_from, import_this, version, output):
    path = construct_path(import_from, import_this)
    name = import_this if import_this else import_from
    info = get_info(
        name=name, version=version, type="module", rcType=COLLECTION, path=path
    )
    output[path] = info


def callable_info(obj, import_from, import_this, version, output):
    path = construct_path(import_from, import_this)
    info = get_info(
        name=import_this, version=version, type="callable", rcType=CALLABLE, path=path
    )
    output[path] = info
    for v in inspect.signature(obj).parameters.values():
        if v.kind not in [
            inspect.Parameter.VAR_POSITIONAL,
            inspect.Parameter.VAR_KEYWORD,
        ]:
            parameter_info(path, v, version, output)


def parameter_info(obj_path, param, version, output):
    path = f"{obj_path}.{param.name}"
    info = get_info(
        name=param.name,
        version=version,
        defaultVal=str(param.default),
        type=str(param.annotation),
        rcType=PARAMETER,
        path=path,
    )
    output[path] = info


def get_args(path, version, output):
    xs = path.split(".")
    if len(xs) == 1:
        import_from, import_this = xs[0], None
    else:
        import_from, import_this = ".".join(xs[:-1]), xs[-1]

    if import_this:
        # try import_from as a package
        try:
            obj = importlib.import_module(f".{import_this}", import_from)
        # try import_from as a module
        except ModuleNotFoundError:
            obj = importlib.import_module(import_from)
            obj = getattr(obj, import_this)
    else:
        obj = importlib.import_module(import_from)

    if inspect.ismodule(obj):
        module_info(import_from, import_this, version, output)
    elif inspect.isclass(obj) or inspect.isfunction(obj):
        callable_info(obj, import_from, import_this, version, output)


def get_args_for_all_subpaths(x, output):
    xs = x.split(".")
    try:
        version = importlib.metadata.version(xs[0])
    except importlib.metadata.PackageNotFoundError:
        version = None
    for i in range(1, len(xs) + 1):
        get_args(".".join(xs[:i]), version, output)


def info(yaml_path):
    sys.path.insert(0, os.getcwd())

    with open(yaml_path, "r") as f:
        specs = yaml.safe_load(f)

    output = InfoDict(yaml_path)
    for x in specs:
        get_args_for_all_subpaths(x, output)

    output.finalize()
    output.save()
