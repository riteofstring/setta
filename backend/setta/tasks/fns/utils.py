import importlib.util
import os
import subprocess
import tempfile
from typing import Any, Callable, List, Optional

from pydantic import BaseModel

from setta.tasks.task_runner import RunType


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


def withTempFiles(write, in_file_with_suffix, then_do, auto_delete=True):
    if len(write) != len(in_file_with_suffix):
        raise ValueError("Writes and suffixes lists must have the same length.")

    temp_files = []
    try:
        dir_name = ".setta_code"
        os.makedirs(dir_name, exist_ok=True)
        # Create temporary files
        for w, suffix in zip(write, in_file_with_suffix):
            temp_file = tempfile.NamedTemporaryFile(
                dir=dir_name,
                mode="w+",
                prefix="setta_temp_",
                suffix=suffix,
                delete=False,
            )
            temp_file.write(w)
            temp_file.flush()
            temp_files.append(temp_file)

        # Get the relative paths of all temporary files
        temp_file_paths = [
            os.path.relpath(temp_file.name).replace(os.sep, "/")
            for temp_file in temp_files
        ]

        return then_do(temp_file_paths)

    except subprocess.CalledProcessError as e:
        print(e, flush=True)
        print(e.stdout, flush=True)
        print(e.stderr, flush=True)
        return e

    finally:
        if auto_delete:
            # Clean up the temporary files
            for temp_file in temp_files:
                temp_file.close()
                os.remove(temp_file.name)


def do_nothing(*args, **kwargs):
    pass


class TaskDefinition(BaseModel):
    name: str
    fn: Callable
    read_cache: Optional[Callable] = do_nothing
    write_cache: Optional[Callable] = do_nothing
    run_as: Optional[RunType] = RunType.NONE
    is_built_in: Optional[bool] = False
    dependencies: Optional[List[str]] = []


class TaskMessage(BaseModel):
    id: str
    content: Any
