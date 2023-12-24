import importlib
import os
import sys


def import_from_path(file_path):
    # Extract directory and module name from file path
    module_dir, module_file = os.path.split(file_path)
    module_name, _ = os.path.splitext(module_file)

    # Add the module's directory to sys.path
    sys.path.insert(0, module_dir)

    # Import the module using its name
    module = importlib.import_module(module_name)

    # Remove the directory from sys.path
    sys.path.pop(0)

    return module
