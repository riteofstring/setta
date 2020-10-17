from abcde.utils import common_functions as c_f
from abcde.registration.module_info import ModuleInfo
import torch
import unittest


class TestGetInitArguments(unittest.TestCase):
    def test_get_init_arguments(self):
        x = c_f.get_init_arguments(torch.nn.CrossEntropyLoss)
        x = c_f.get_init_arguments(ModuleInfo)
        for k, v in x.items():
            if c_f.parameter_has_default(v):
                print("{} has default".format(k))
