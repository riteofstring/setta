from abcde.registration.class_info import ClassInfo
from abcde.templates import simple_train_test
import unittest

class TestSimpleExport(unittest.TestCase):
    def test_simple_export(self):
        x = ClassInfo(simple_train_test.main)
        print(x.json())
