from abcde.registration.class_info import ClassInfo
import torch
import unittest


class TestClassInfo(unittest.TestCase):
    def test_class_info(self):
        x = ClassInfo(torch.nn.CrossEntropyLoss, include=("size_average",))
        self.assertTrue(list(x.cls_args.keys()) == ["size_average"])

        x = ClassInfo(torch.nn.functional.cross_entropy, include=("size_average",))
        self.assertTrue(list(x.cls_args.keys()) == ["size_average"])

        self.assertRaises(TypeError, lambda: ClassInfo(torch.nn.functional))
