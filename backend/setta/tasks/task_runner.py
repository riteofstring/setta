import asyncio
import inspect
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from enum import Enum

from ..utils.constants import C, set_constants


def copyConstsThenRunFn(inputC, fn, fn_args):
    set_constants(**vars(inputC))
    return fn(fn_args)


def sync_wrapper(fn, *args, **kwargs):
    return asyncio.run(fn(*args, **kwargs))


class RunType(Enum):
    SUBPROCESS = "SUBPROCESS"
    THREAD = "THREAD"
    NONE = "NONE"


class TaskRunner:
    def __init__(self):
        self.pool_executor = ProcessPoolExecutor(max_workers=2)
        self.thread_executor = ThreadPoolExecutor(max_workers=2)
        self.tasks_dict = {}
        self.loop = asyncio.get_event_loop()

    async def cancel_existing(self, id):
        if id in self.tasks_dict:
            task = self.tasks_dict[id]
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            self.remove_task(id)

    def remove_task(self, id):
        self.tasks_dict.pop(id, None)

    async def run(self, id, fn, fn_args, run_as):
        await self.cancel_existing(id)
        if run_as == RunType.NONE:
            fn(*fn_args)
        elif run_as in [RunType.THREAD, RunType.SUBPROCESS]:
            if run_as == RunType.SUBPROCESS:
                executor = self.pool_executor
                fn_args = [C, fn, *fn_args]
                fn = copyConstsThenRunFn
            else:
                executor = self.thread_executor

            if inspect.iscoroutinefunction(fn):
                future = self.loop.run_in_executor(executor, sync_wrapper, fn, *fn_args)
            else:
                future = self.loop.run_in_executor(executor, fn, *fn_args)

            self.tasks_dict[id] = future
            try:
                result = await future
                self.remove_task(id)
                return result
            except asyncio.CancelledError:
                self.remove_task(id)
                raise
        else:
            raise ValueError
