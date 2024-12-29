import importlib.util
import sys
import uuid


def import_code_from_string(code_string, module_name=None, add_to_sys_modules=False):
    # Generate a unique module name if one isn't provided
    if module_name is None:
        module_name = f"setta_dynamic_module_{uuid.uuid4().hex}"

    # Create a new module spec
    spec = importlib.util.spec_from_loader(module_name, loader=None)

    # Create a new module based on the spec
    module = importlib.util.module_from_spec(spec)

    # Optionally add the module to sys.modules
    if add_to_sys_modules:
        sys.modules[module_name] = module

    # Compile the code string
    code_object = compile(code_string, module_name, "exec")

    # Execute the compiled code object in the module's namespace
    exec(code_object, module.__dict__)

    return module
