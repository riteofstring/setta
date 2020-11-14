from abcde.registration.imports_holder import ImportsHolder
import unittest


class TestClassInfo(unittest.TestCase):
    def test_class_info(self):
        x = ImportsHolder()
        x.set_import("torch")
        self.assertTrue(x.get_import("torch.nn"))

        x.set_import("torch.nn")
        self.assertTrue(x.get_import("torch.nn.CrossEntropyLoss"))

        x.set_import("torchvision.models")
        self.assertTrue(x.get_import("torchvision.models.densenet161"))

        x.set_import("torch")
        self.assertTrue(x.get_import("torch.utils.data.DataLoader"))

        x = ImportsHolder()
        x.set_import("torchvision")
        self.assertTrue(x.get_import("torchvision.models.densenet161"))
