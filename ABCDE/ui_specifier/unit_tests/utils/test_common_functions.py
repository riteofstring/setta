from ui_specifier.utils import common_functions as c_f
from ui_specifier.registration.class_info import ClassInfo
import torch
import unittest
import inspect


class TestGetInitArguments(unittest.TestCase):
    def test_get_args(self):
        x = c_f.get_args(torch.nn.CrossEntropyLoss)
        x = c_f.get_args(ClassInfo)
        for k, v in x.items():
            if c_f.parameter_has_default(v):
                self.assertTrue(v.default != inspect.Signature.empty)

    def test_merge_dicts(self):
        x = {"apple": 5}
        y = {"horse": 7}

        z = c_f.merge_dicts(x, y)

        self.assertTrue(x == {"apple": 5})
        self.assertTrue(y == {"horse": 7})
        self.assertTrue(z == {"apple": 5, "horse": 7})
