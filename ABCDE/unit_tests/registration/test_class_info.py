from abcde.registration.class_info import ClassInfo
import torch
import unittest


class TestClassInfo(unittest.TestCase):
    def test_class_info(self):
        x = ClassInfo(torch.nn.CrossEntropyLoss)
        x.expose("size_average")
        self.assertTrue(x.expose_list == ["size_average"])
        y = x.as_json()

        x = ClassInfo(torch.nn.functional.cross_entropy)
        x.expose("size_average")
        self.assertTrue(x.expose_list == ["size_average"])
        y = x.as_json()

        self.assertRaises(TypeError, lambda: ClassInfo(torch.nn.functional))
