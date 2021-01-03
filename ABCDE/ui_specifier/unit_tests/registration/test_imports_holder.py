import unittest

import torch
import torchvision

from ui_specifier.registration.imports_holder import ImportsHolder


class TestClassInfo(unittest.TestCase):
    def test_class_info(self):
        x = ImportsHolder()
        x.set_import("torch")
        module_name, module = x.get_import("torch.nn")
        self.assertTrue(module_name == "torch" and module is torch.nn)

        x.set_import("torch.nn")
        module_name, module = x.get_import("torch.nn.CrossEntropyLoss")
        self.assertTrue(
            module_name == "torch.nn" and module is torch.nn.CrossEntropyLoss
        )

        x.set_import("torchvision.models")
        module_name, module = x.get_import("torchvision.models.densenet161")
        self.assertTrue(
            module_name == "torchvision.models"
            and module is torchvision.models.densenet161
        )

        x.set_import("torch")
        module_name, module = x.get_import("torch.utils.data.DataLoader")
        self.assertTrue(
            module_name == "torch.utils.data" and module is torch.utils.data.DataLoader
        )

        x = ImportsHolder()
        x.set_import("torchvision")
        module_name, module = x.get_import("torchvision.models.densenet161")
        self.assertTrue(
            module_name == "torchvision.models"
            and module is torchvision.models.densenet161
        )
