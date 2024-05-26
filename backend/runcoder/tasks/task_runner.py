import asyncio
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor


class TaskRunner:
    def __init__(self):
        self.pool_executor = ProcessPoolExecutor(max_workers=2)
        self.thread_executor = ThreadPoolExecutor(max_workers=2)
        self.tasks_dict = {}
        self.loop = asyncio.get_event_loop()

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

    async def run_non_blocking_subprocess(self, fn, use_thread, *args):
        executor = self.thread_executor if use_thread else self.pool_executor
        return await self.loop.run_in_executor(executor, fn, *args)
