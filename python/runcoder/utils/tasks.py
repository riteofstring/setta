import asyncio
import multiprocessing
from asyncio import CancelledError
from concurrent.futures import ProcessPoolExecutor
import uuid
import os
import signal

def start_process(queue, function, *args):
    result = function(*args)
    queue.put(result)


class Tasks:
    def __init__(self):
        self.executor = ProcessPoolExecutor()
        self.tasks_dict = {}
        self.m = multiprocessing.Manager()
        self.p_dict = self.m.dict()
        self.counter = 0

    async def create_task(self, id, *args, **kwargs):
        await self.cancel_existing(id)
        x = asyncio.create_task(*args, **kwargs)
        x.add_done_callback(lambda t: self.remove_task(id))
        self.tasks_dict[id] = x

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

    async def run_non_blocking_subprocess(self, fn, *args):
        id = None
        try:
            id = uuid.uuid4()
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(self.executor, fn, self.p_dict, id, *args)
        except CancelledError:
            if id in self.p_dict:
                print("canceling pid", self.p_dict[id])
                os.kill(self.p_dict[id], signal.SIGINT)
            raise
