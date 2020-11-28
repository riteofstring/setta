from ui_specifier.utils import yaml_parsing as yp
from ui_specifier.registration.global_dicts import add_to_ref_dict
import unittest
import os
import shutil
import torch


def create_optimizer(model, optimizer, **kwargs):
    device = torch.device("cuda")
    model = model.to(device)
    add_to_ref_dict(optimizer=optimizer(model.parameters(), **kwargs))


class TestSimpleTrainTest(unittest.TestCase):
    def test_simple_train_test(self):
        curr_dir = os.path.dirname(os.path.abspath(__file__))
        config = yp.load_yaml(os.path.join(curr_dir, "simple_train_test.yaml"))
        yp.run(config)
        shutil.rmtree("MNIST")
