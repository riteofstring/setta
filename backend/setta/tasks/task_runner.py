import asyncio
import inspect
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from enum import Enum

from ..utils.constants import C, set_constants


def copyConstsThenRunFn(inputC, fn, fn_args):
    set_constants(**vars(inputC))
    return fn(fn_args)


class RunType(Enum):
    SUBPROCESS = "SUBPROCESS"
    THREAD = "THREAD"
    NONE = "NONE"


class TaskRunner:
    def __init__(self):
        self.thread_executor = ThreadPoolExecutor(max_workers=2)
        self.process_executor = ProcessPoolExecutor(max_workers=2)
        self.tasks_dict = {}

    async def cancel_existing(self, id):
        if id in self.tasks_dict:
            task = self.tasks_dict[id]
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                print(f"Task {id} raised an unexpected exception: {e}")
            finally:
                self.remove_task(id)

    def remove_task(self, id):
        self.tasks_dict.pop(id, None)

    async def run(self, id, fn, fn_args, run_as):
        await self.cancel_existing(id)
        
        # For async functions, always run in main event loop
        if inspect.iscoroutinefunction(fn):
            task = asyncio.get_running_loop().create_task(fn(*fn_args))
            self.tasks_dict[id] = task
            try:
                result = await task
                self.remove_task(id)
                return result
            except asyncio.CancelledError:
                self.remove_task(id)
                raise
                
        # For sync functions
        else:
            if run_as == RunType.NONE:
                return fn(*fn_args)
            elif run_as == RunType.THREAD:
                executor = self.thread_executor
            elif run_as == RunType.SUBPROCESS:
                executor = self.process_executor
            else:
                raise ValueError(f"Unsupported RunType: {run_as}")

            future = asyncio.get_running_loop().run_in_executor(executor, fn, *fn_args)
            self.tasks_dict[id] = future
            try:
                result = await future
                self.remove_task(id)
                return result
            except asyncio.CancelledError:
                self.remove_task(id)
                raise