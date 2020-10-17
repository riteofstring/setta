from abcde.registration.module_info import ModuleInfo
import torch
import unittest


class TestModuleInfo(unittest.TestCase):
    def test_module_info(self):
        x = ModuleInfo(torch.nn.CrossEntropyLoss)
        x.expose("size_average")
        self.assertTrue(x.expose_list == ["size_average"])
