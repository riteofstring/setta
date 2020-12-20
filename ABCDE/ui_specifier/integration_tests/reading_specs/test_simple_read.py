import torch
import unittest
import os
import shutil
from ui_specifier.utils import yaml_parsing as yp


def optimizer_factory(model, optimizer, **kwargs):
    # device = torch.device("cuda")
    # model = model.to(device)
    return optimizer(model.parameters(), **kwargs)


class TestSimpleRead(unittest.TestCase):
    def test_simple_read(self):
        script_name = "simple_train_test"
        curr_dir = os.path.dirname(os.path.abspath(__file__))
        ui_selections = yp.load_yaml(
            os.path.join(curr_dir, "{}_ui_selections.yaml".format(script_name))
        )
        factory_specs = yp.load_yaml(
            os.path.join(curr_dir, "{}_factory_specs.yaml".format(script_name))
        )

        objs = yp.create_objs_from_ui_selections(ui_selections, factory_specs)

        print(objs)

        shutil.rmtree("MNIST")
