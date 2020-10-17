from abcde.registration.class_info import ClassInfo
from abcde.registration.module_info import ModuleInfo
from abcde.templates import simple_train_test
from abcde.utils import common_functions as c_f
import abcde
import unittest
import torchvision
import torch
import json


class TestSimpleExport(unittest.TestCase):
    def test_simple_export(self):
        output = {}
        output["model"] = ModuleInfo(torchvision.models).as_dict("functions")
        output["model"] = c_f.merge_dicts(
            output["model"], ModuleInfo(simple_train_test).as_dict("classes")
        )
        output["optimizer"] = ModuleInfo(torch.optim).as_dict("classes")
        output["train_set"] = ModuleInfo(torchvision.datasets).as_dict("classes")
        output["val_set"] = output["train_set"]
        output["transform"] = ModuleInfo(torchvision.transforms).as_dict("classes")
        output = json.dumps(output, indent=4)
        print(output)
