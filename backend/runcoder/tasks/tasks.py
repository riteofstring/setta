import asyncio
from typing import Dict

from ..utils.constants import C, set_constants
from . import fns
from .cache import Cache
from .fns.utils import TaskDefinition, TaskMessage, import_from_path
from .task_runner import TaskRunner


def copyConstsThenRunFn(inputC, fn, message):
    set_constants(**vars(inputC))
    return fn(message)


class Tasks:
    def __init__(self):
        self.task_runner = TaskRunner()
        self.cache = Cache()
        self.fns: Dict[str, TaskDefinition] = {}
        self.add_fns_from_module(fns)

    async def __call__(self, message: TaskMessage):
        try:
            # print(f"Start processing message ID: {message.id}", flush=True)
            fn = self.fns[message.fn_name]
            fn.read_cache(self.cache, message)
            result = await self.task_runner.run_non_blocking_subprocess(
                copyConstsThenRunFn, fn.as_subprocess, C, fn.fn, message
            )
            fn.write_cache(self.cache, message, result)
            return result
        except asyncio.CancelledError:
            # print(f"Task for {message.id} was cancelled.", flush=True)
            return {"output": None, "name": None}

    def add_fn(self, task_def: TaskDefinition):
        self.fns[task_def.name] = task_def

    def add_fns_from_path(self, path):
        module = import_from_path(path)
        self.add_fns_from_module(module)

    def add_fns_from_module(self, module):
        for attr in vars(module).values():
            if isinstance(attr, TaskDefinition):
                self.add_fn(attr)

    @property
    def custom_fn_names(self):
        return [k for k, v in self.fns.items() if not v.is_built_in]
