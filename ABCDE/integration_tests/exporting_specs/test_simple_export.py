from abcde.registration.class_info import ClassInfo
from abcde.registration.module_info import ModuleInfo
from abcde.utils.constants import TYPE_MAP, Category
from abcde.templates import simple_train_test
from abcde.utils import common_functions as c_f
import abcde
import unittest
import torchvision
import torch
import json
from typing import List
import typing


def test_function(
    a: int,
    b: str,
    c: List[List[float]] = [[1, 2, 3], [4, 5, 6]],
    d: type(None) = None,
    e: typing.Optional[int] = 5,
    f: typing.Tuple[typing.Tuple[int, float], ...] = ((5, 6), (7, 8)),
    g: typing.Dict[str, int] = {"hello": 100},
    h: torchvision.transforms.CenterCrop = torchvision.transforms.CenterCrop(224),
):
    return True


class TestSimpleExport(unittest.TestCase):
    def test_simple_export(self):

        TYPE_MAP.register_alias(torch.Tensor, typing.List[float])
        # x = ClassInfo(torchvision.transforms.Compose)
        # print(x.as_dict())
        x = ModuleInfo(torchvision.transforms)
        # print(x.classes["Parameter"].cls_args)
        x.set_type("Compose", "transforms", Category(torchvision.transforms))
        # print(x.classes["Compose"].as_dict())
        # x.set_type("transforms", Category("transform"))
        # print(x.as_dict())

        # x = ClassInfo(test_function)
        # print(x.cls_args)

        # output = {}
        # output["model"] = ModuleInfo(torchvision.models).as_dict("functions")
        # output["model"] = c_f.merge_dicts(
        #     output["model"], ModuleInfo(simple_train_test).as_dict("classes")
        # )
        # output["optimizer"] = ModuleInfo(torch.optim).as_dict("classes")
        # output["train_set"] = ModuleInfo(torchvision.datasets).as_dict("classes")
        # output["val_set"] = output["train_set"]
        # output["transform"] = ModuleInfo(torchvision.transforms).as_dict("classes")
        # output["transform"]["torchvision.transforms"]["classes"]["Compose"]["args"]["transforms"]["type"] = torchvision.transforms
        # output = json.dumps(output, indent=4)
        # output = json.loads(output)
        # print(output["transform"]["torchvision.transforms"]["classes"]["Compose"])
