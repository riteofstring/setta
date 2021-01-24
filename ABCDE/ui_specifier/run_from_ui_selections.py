import sys

sys.path.insert(0, "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\src")
import argparse
import ast
import json
import os
import shutil

import yaml

from ui_specifier.utils import yaml_parsing as yp


def write_yaml(fname, input_dict, open_as):
    with open(fname, open_as) as outfile:
        yaml.dump(input_dict, outfile, default_flow_style=False, sort_keys=False)


def convert_strings(json_dict):
    new_dict = {}

    for k, v in json_dict.items():
        try:
            new_v = ast.literal_eval(v)
        except ValueError:
            new_v = v
        if isinstance(new_v, dict):
            new_v = convert_strings(new_v)
        elif isinstance(new_v, (list, tuple)):
            new_v = [convert_strings(x) if isinstance(x, dict) else x for x in new_v]
        new_dict[k] = new_v
    return new_dict


def main(args):
    ui_selections = json.loads(args.ui_selections)
    ui_selections = convert_strings(ui_selections)

    print("******NORMALIZE TRANSFORM******")
    print(
        ui_selections["Transform"]["torchvision.transforms.Compose"]["transforms"][1][
            "torchvision.transforms.Normalize"
        ]
    )

    # write_yaml("python_test.yaml", ui_selections, "w") # for debugging

    factory_specs = yp.load_yaml(
        "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs\\simple_train_test_factory_specs.yaml"
    )

    funcs = yp.load_yaml(
        "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs\\simple_train_test_functions.yaml"
    )
    objs = yp.create_objs_from_ui_selections(ui_selections, factory_specs)

    yp.run(objs, funcs)

    shutil.rmtree("MNIST")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("ui_selections")
    args = parser.parse_args()
    main(args)
