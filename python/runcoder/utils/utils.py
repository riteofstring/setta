import importlib.util
import os


def import_from_path(file_path):
    # Extract directory and module name from file path
    module_dir, module_file = os.path.split(file_path)
    module_name, _ = os.path.splitext(module_file)

    # Create a module spec from the file path
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None:
        raise ImportError(f"Could not load module spec for {file_path}")

    # Create a new module based on the spec
    module = importlib.util.module_from_spec(spec)
    if module is None:
        raise ImportError(f"Could not create module from spec for {file_path}")

    # Load the module
    spec.loader.exec_module(module)

    return module
