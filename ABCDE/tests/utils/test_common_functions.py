from abcde.utils import common_functions as c_f
from abcde.registration.module_info import ModuleInfo
import torch
import unittest
import inspect


class TestGetInitArguments(unittest.TestCase):
    def test_get_init_arguments(self):
        x = c_f.get_init_arguments(torch.nn.CrossEntropyLoss)
        x = c_f.get_init_arguments(ModuleInfo)
        for k, v in x.items():
            if c_f.parameter_has_default(v):
                self.assertTrue(v.default != inspect.empty)

    def test_merge_dicts(self):
        x = {"apple": 5}
        y = {"horse": 7}

        z = c_f.merge_dicts(x, y)

        self.assertTrue(x == {"apple": 5})
        self.assertTrue(y == {"horse": 7})
        self.assertTrue(z == {"apple": 5, "horse": 7})
