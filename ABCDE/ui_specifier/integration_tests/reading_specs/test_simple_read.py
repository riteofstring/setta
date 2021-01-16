import os
import shutil
import unittest

import torch

from ui_specifier.utils import yaml_parsing as yp


def dataset_factory(dataset, transform, **kwargs):
    return dataset(root=".", transform=transform, **kwargs)


class TestSimpleRead(unittest.TestCase):
    def test_simple_read(self):
        script_name = "simple_train_test"
        curr_dir = os.path.dirname(os.path.abspath(__file__))
        curr_dir = curr_dir.replace("\\", "\\\\")
        ui_selections = yp.load_yaml(
            os.path.join(curr_dir, "{}_ui_selections.yaml".format(script_name))
        )
        factory_specs = yp.load_yaml(
            os.path.join(curr_dir, "{}_factory_specs.yaml".format(script_name))
        )
        # funcs = yp.load_yaml(
        #     os.path.join(curr_dir, "{}_functions.yaml".format(script_name))
        # )

        objs = yp.create_objs_from_ui_selections(ui_selections, factory_specs)
        output_filename = os.path.join(curr_dir, "test_write_output.py")
        with open(output_filename, "w") as text_file:
            print("import sys", file=text_file)
            print("sys.path.insert(0, '{}/../../src')".format(curr_dir), file=text_file)
            for v in objs.values():
                print(v, file=text_file, end="")

        import subprocess

        subprocess.run(["python", output_filename])

        # yp.run(objs, funcs)

        # shutil.rmtree("MNIST")
