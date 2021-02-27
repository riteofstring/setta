import unittest

import torch

from abcde_pip.registration.module_info import ModuleInfo


class TestModuleInfo(unittest.TestCase):
    def test_module_infoe(self):
        self.assertRaises(TypeError, lambda: ModuleInfo(torch.nn.CrossEntropyLoss))
        x = ModuleInfo(torch.nn)
