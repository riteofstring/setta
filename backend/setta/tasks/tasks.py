import asyncio
import os
from typing import Dict

from . import fns
from .fns.utils import (
    TaskDefinition,
    TaskMessage,
    import_code_from_string,
    import_from_path,
)
from .task_runner import TaskRunner


class Tasks:
    def __init__(self, lsp_writer):
        self.lsp_writer = lsp_writer
        self.task_runner = TaskRunner()
        self.cache = {}
        self.fns: Dict[str, TaskDefinition] = {}
        self.add_fns_from_module(fns)

    async def __call__(self, fn_name, message: TaskMessage):
        try:
            print(f"Start processing message ID: {message.id}", flush=True)
            fn = self.fns[fn_name]
            fn.read_cache(self.cache, message)
            fn_args = [message, *(getattr(self, k) for k in fn.dependencies)]
            result = await self.task_runner.run(message.id, fn.fn, fn_args, fn.run_as)
            fn.write_cache(self.cache, message, result)
            return result
        except asyncio.CancelledError:
            print(f"Task for {message.id} was cancelled.", flush=True)
            return {"output": None, "name": None}

    def add_fn(self, task_def: TaskDefinition):
        self.fns[task_def.name] = task_def

    def add_fns_from_path(self, path):
        module = import_from_path(path)
        if module:
            self.add_fns_from_module(module)
        print("add_fns_from_path", flush=True)

    def add_fns_from_strings(self, codeDict, project_config_name):
        error_msgs = {}
        task_names = []
        for id, code in codeDict.items():
            task_name = f"{project_config_name}-{id}"
            try:
                module = import_code_from_string(code)
                if module:
                    task_names.extend(
                        self.add_fns_from_module(module, task_name=task_name)
                    )
                print("add_fns_from_string", self.fns, flush=True)

            except Exception as e:
                error_msgs[task_name] = str(e)
        return task_names, error_msgs

    def add_fns_from_module(self, module, task_name=None):
        count = 1
        task_names = []
        for attr in vars(module).values():
            if isinstance(attr, TaskDefinition):
                if not attr.name:
                    if not task_name:
                        raise ValueError(
                            "Either TaskDefinition must be initialized with a name, or task_name must be specified"
                        )
                    attr.name = f"{task_name}-{count}"
                    count += 1
                self.add_fn(attr)
                task_names.append(attr.name)
        return task_names

    @property
    def custom_fn_names(self):
        return [k for k, v in self.fns.items() if not v.is_built_in]
