from abcde_pip.creation import create_ui
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("ui_specs")
    args = parser.parse_args()
    ui_specs, factories, funcs = create_ui(args.ui_specs)
    with open("ui_specs.json", "w") as text_file:
        print(ui_specs, file=text_file)

    with open("factories.json", "w") as text_file:
        print(factories, file=text_file)

    with open("funcs.json", "w") as text_file:
        print(funcs, file=text_file)