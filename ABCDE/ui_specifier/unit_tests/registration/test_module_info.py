from ui_specifier.registration.module_info import ModuleInfo
import torch
import unittest


class TestModuleInfo(unittest.TestCase):
    def test_module_infoe(self):
        self.assertRaises(TypeError, lambda: ModuleInfo(torch.nn.CrossEntropyLoss))
        x = ModuleInfo(torch.nn)
