import os
import shutil
import unittest

import torch
from ui_specifier.utils import yaml_parsing as yp


class TestSimpleRead(unittest.TestCase):
    def test_simple_read(self):
        script_name = "simple_train_test"
        curr_dir = os.path.dirname(os.path.abspath(__file__))
        curr_dir = curr_dir.replace("\\", "\\\\")
        all_specs = yp.load_yaml(os.path.join(curr_dir, "{}.yaml".format(script_name)))
        ui_selections = all_specs["SELECTIONS"]
        factory_specs = all_specs["FACTORIES"]
        funcs = all_specs["FUNCS"]
        ui_repr = yp.generate_code(ui_selections, factory_specs, funcs)

        print(ui_repr)

        output_filename = os.path.join(curr_dir, "test_write_output.py")
        with open(output_filename, "w") as text_file:
            print(ui_repr, file=text_file, end="")

        import subprocess

        subprocess.run(["python", output_filename])

        shutil.rmtree("MNIST")

        os.remove(output_filename)
