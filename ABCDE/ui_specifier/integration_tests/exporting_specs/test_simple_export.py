import importlib
import json
import os
import typing
import unittest
from typing import List

from ui_specifier.registration.class_info import ClassInfo
from ui_specifier.registration.imports_holder import ImportsHolder
from ui_specifier.registration.module_info import ModuleInfo
from ui_specifier.registration.ui_creator import UICreator
from ui_specifier.templates import simple_train_test
from ui_specifier.utils import common_functions as c_f
from ui_specifier.utils import yaml_parsing as yp
from ui_specifier.utils.type_map import TYPE_MAP, NestedObject

import ui_specifier

# def test_function(
#     a: int,
#     b: str,
#     c: List[List[float]] = [[1, 2, 3], [4, 5, 6]],
#     d: type(None) = None,
#     e: typing.Optional[int] = 5,
#     f: typing.Tuple[typing.Tuple[int, float], ...] = ((5, 6), (7, 8)),
#     g: typing.Dict[str, int] = {"hello": 100},
#     h: torchvision.transforms.CenterCrop = torchvision.transforms.CenterCrop(224),
# ):
#     return True


class TestSimpleExport(unittest.TestCase):
    def test_simple_export(self):

        curr_dir = os.path.dirname(os.path.abspath(__file__))
        config = yp.load_yaml(os.path.join(curr_dir, "simple_train_test.yaml"))

        imports = config.pop("IMPORTS", {})
        global_ih = ImportsHolder()
        global_ih.set_imports(imports)

        ui_types = config.pop("UI_TYPES", {})
        TYPE_MAP.register_from_dict(ui_types)

        sections = config.pop("SECTIONS", {})

        ui = UICreator()
        ui.create(sections, global_ih)

        test_filepath = "test.json"
        ui.export(test_filepath)

        import subprocess

        x = subprocess.run(["node", os.path.join(curr_dir, "json_parsing.js")])
        self.assertTrue(x.returncode == 0)

        # os.remove(test_filepath)

        # TYPE_MAP.register_alias(torch.Tensor, typing.List[float])
        # # x = ClassInfo(torchvision.transforms.Compose)
        # # print(x.as_dict())
        # x = ModuleInfo(torchvision.transforms)
        # # print(x.classes["Parameter"].cls_args)
        # x.set_type("Compose", "transforms", NestedObject(torchvision.transforms))
        # # print(x.classes["Compose"].as_dict())
        # # x.set_type("transforms", NestedObject("transform"))
        # # print(x.as_dict())

        # # x = ClassInfo(test_function)
        # # print(x.cls_args)

        # # output = {}
        # # output["model"] = ModuleInfo(torchvision.models).as_dict("functions")
        # # output["model"] = c_f.merge_dicts(
        # #     output["model"], ModuleInfo(simple_train_test).as_dict("classes")
        # # )
        # # output["optimizer"] = ModuleInfo(torch.optim).as_dict("classes")
        # # output["train_set"] = ModuleInfo(torchvision.datasets).as_dict("classes")
        # # output["val_set"] = output["train_set"]
        # # output["transform"] = ModuleInfo(torchvision.transforms).as_dict("classes")
        # # output["transform"]["torchvision.transforms"]["classes"]["Compose"]["args"]["transforms"]["type"] = torchvision.transforms
        # # output = json.dumps(output, indent=4)
        # # output = json.loads(output)
        # # print(output["transform"]["torchvision.transforms"]["classes"]["Compose"])

        # ui = UICreator()
        # ui.add("model", ModuleInfo(simple_train_test, "classes"))

        # x = ModuleInfo(torchvision.transforms, "classes")
        # x.set_type("Compose", "transforms", NestedObject(torchvision.transforms))
        # ui.add("transform", x)

        # ui.add("train_set", ClassInfo(torchvision.datasets.MNIST, include=("root",)))
        # ui.add("val_set", ClassInfo(torchvision.datasets.MNIST, include=("root",)))

        # ui.add("optimizer", ModuleInfo(torch.optim))

        # ui.add(
        #     "main_function",
        #     ClassInfo(
        #         simple_train_test.main,
        #         include=("batch_size", "test_batch_size", "epochs"),
        #     ),
        # )
        # json_output = ui.export()

        # print(json_output)
