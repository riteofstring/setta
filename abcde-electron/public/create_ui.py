from abcde_pip.creation import create_ui
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("ui_specs")
    args = parser.parse_args()
    return create_ui(args.ui_specs)