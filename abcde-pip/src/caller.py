import argparse
import json

from abcde_pip.creation.create_ui import create_ui


def main(args):
    with open(args.ui_specs_file, "r") as f:
        ui_specs = f.read()

    with open("temp_out.json", "w") as fp:
        json.dump(create_ui(ui_specs), fp, indent=4)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("ui_specs_file", type=str, default=None)
    args = parser.parse_args()
    main(args)
