import os
import shutil
import unittest
from subprocess import PIPE, Popen

from ui_specifier.utils import yaml_parsing as yp


class TestSimpleRead(unittest.TestCase):
    def test_simple_read(self):
        script_name = "simple_train_test"
        curr_dir = os.path.dirname(os.path.abspath(__file__))
        all_specs = yp.load_yaml(os.path.join(curr_dir, "{}.yaml".format(script_name)))
        ui_selections = all_specs["SELECTED"]
        factory_specs = all_specs["FACTORIES"]
        funcs = all_specs["FUNCS"]
        ui_repr = yp.generate_code(ui_selections, factory_specs, funcs)

        print(ui_repr)

        base_filename = "test_write_output.py"
        output_filename = os.path.join(curr_dir, base_filename)
        with open(output_filename, "w") as text_file:
            print(ui_repr, file=text_file, end="")

        cmd = f"conda deactivate && activate machine_learning && python {base_filename}"
        process = Popen(
            cmd.split(" "), stdout=PIPE, stderr=PIPE, cwd=curr_dir, shell=True
        )
        stdout, stderr = process.communicate()

        os.remove(output_filename)
