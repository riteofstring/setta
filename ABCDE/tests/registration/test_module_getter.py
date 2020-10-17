from abcde.registration.module_getter import ModuleGetter
import torch
import unittest


class TestModuleGetter(unittest.TestCase):
    def test_module_getter(self):
        x = ModuleGetter()
        x.register("loss", torch.nn)
        y = x.get("loss", yaml_dict={"CrossEntropyLoss": {}})
        self.assertTrue(type(y) is torch.nn.CrossEntropyLoss)
