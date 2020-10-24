from abcde.registration.class_info import ClassInfo
from abcde.registration.module_info import ModuleInfo
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
):
    return True


class TestSimpleExport(unittest.TestCase):
    def test_simple_export(self):

        # x = ClassInfo(torch.nn.CrossEntropyLoss)
        # print(typing.get_args(x.cls_args["weight"]["type"]))

        x = ClassInfo(test_function)
        print(x.cls_args)

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
