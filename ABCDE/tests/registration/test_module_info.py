from abcde.registration.module_info import ModuleInfo
import torch
import unittest


class TestGetInitArguments(unittest.TestCase):
    def test_module_info(self):
        x = ModuleInfo(torch.nn.CrossEntropyLoss, expose=["size_average"])
        print(x.expose)
