import importlib.util
import os
import sys
import uuid
from typing import Any, Callable, List, Optional

from pydantic import BaseModel

from setta.tasks.task_runner import RunType
from setta.utils.constants import C


def import_from_path(file_path):
    if not os.path.isfile(file_path):
        return None
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


def do_nothing(*args, **kwargs):
    pass


class TaskDefinition(BaseModel):
    name: Optional[str] = ""
    return_message_type: str
    fn: Callable
    read_cache: Optional[Callable] = do_nothing
    write_cache: Optional[Callable] = do_nothing
    run_as: Optional[RunType] = RunType.NONE
    dependencies: Optional[List[str]] = []
    server_dependencies: Optional[List[str]] = []


class TaskMessage(BaseModel):
    id: str
    content: Any


class InteractiveTaskDefinition(TaskDefinition):
    return_message_type: str = C.WS_INTERACTIVE_RETURN
    run_on_import: bool = True
    run_on_project_change: bool = True


def get_task_metadata_for_frontend(task, exporter_obj=None):
    if isinstance(task, InteractiveTaskDefinition):
        dependencies = [
            exporter_obj.var_name_reverse_mapping[d] for d in task.dependencies
        ]
        return {
            "name": task.name,
            "runOnImport": task.run_on_import,
            "runOnProjectChange": task.run_on_project_change,
            "dependencies": dependencies,
        }
    return {"name": task.name}
