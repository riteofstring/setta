from abcde.utils import yaml_parsing as yp
import torch
import unittest
import os


class TestSimpleTrainTest(unittest.TestCase):
    def test_simple_train_test(self):
        curr_dir = os.path.dirname(os.path.abspath(__file__))
        config = yp.load_yaml(os.path.join(curr_dir, "simple_train_test.yaml"))

        funcs = yp.get_func_dict(config)
        for func_name, F in funcs.items():
            collected_args = {}
            for name, args in config[func_name].items():
                created_obj = yp.create_objects(args)
                collected_args[name] = created_obj

            for k, v in collected_args.items():
                print("KEY {}      VALUE {}".format(k, v))
