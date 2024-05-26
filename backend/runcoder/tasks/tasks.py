import asyncio
from typing import Dict

from ..utils.constants import C, set_constants
from .cache import Cache
from .fns.autocomplete import codeCompletion, textFieldCompletion
from .fns.extractArgparseArgs import extractArgparseArgs
from .fns.parametersRequest import parametersRequest
from .fns.textFieldInitializeCode import textFieldInitializeCode
from .fns.typeCheckRequest import typeCheckRequest
from .fns.utils import TaskDefinition
from .task_runner import TaskRunner


def copyConstsThenRunFn(inputC, fn, message):
    set_constants(**vars(inputC))
    return fn(message)


class Tasks:
    def __init__(self):
        self.task_runner = TaskRunner()
        self.cache = Cache()
        self.fns: Dict[str, TaskDefinition] = {}
        self.add_fn(codeCompletion)
        self.add_fn(textFieldCompletion)
        self.add_fn(extractArgparseArgs)
        self.add_fn(parametersRequest)
        self.add_fn(textFieldInitializeCode)
        self.add_fn(typeCheckRequest)

    async def __call__(self, fn_name, message):
        try:
            print(f"Start processing message ID: {message.get('id', None)}", flush=True)
            fn = self.fns[fn_name]
            fn.read_cache(self.cache, message)
            result = await self.task_runner.run_non_blocking_subprocess(
                copyConstsThenRunFn, fn.as_subprocess, C, fn.fn, message
            )
            fn.write_cache(self.cache, message, result)
            return result
        except asyncio.CancelledError:
            print(f"Task for {message.get('id', None)} was cancelled.", flush=True)
            return {"output": None, "name": None}

    def add_fn(self, task_def: TaskDefinition):
        self.fns[task_def.name] = task_def

    @property
    def custom_fn_names(self):
        return [k for k, v in self.fns.items() if not v.is_built_in]
