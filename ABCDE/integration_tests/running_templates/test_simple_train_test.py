from abcde.utils import yaml_parsing as yp
import unittest
import os
import shutil


class TestSimpleTrainTest(unittest.TestCase):
    def test_simple_train_test(self):
        curr_dir = os.path.dirname(os.path.abspath(__file__))
        config = yp.load_yaml(os.path.join(curr_dir, "simple_train_test.yaml"))
        yp.run(config)
        shutil.rmtree("MNIST")
