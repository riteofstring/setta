import asyncio
import multiprocessing
from asyncio import CancelledError
from concurrent.futures import ThreadPoolExecutor


def start_process(queue, function, *args):
    result = function(*args)
    queue.put(result)


class Tasks:
    def __init__(self):
        self.executor = ThreadPoolExecutor()
        self.loop = asyncio.get_event_loop()
        self.tasks_dict = {}

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
        process = None
        try:
            # Create a Queue for inter-process communication
            queue = multiprocessing.Queue()

            # Start the long-running function in a separate process
            process = multiprocessing.Process(
                target=start_process, args=(queue, fn, *args)
            )
            await self.loop.run_in_executor(self.executor, process.start)

            # Now, wait for the result in a non-blocking way
            result = await self.loop.run_in_executor(self.executor, queue.get)
            await self.loop.run_in_executor(self.executor, process.join)

            return result
        except CancelledError:
            if process:
                try:
                    process.terminate()
                except AttributeError:
                    pass
            raise
