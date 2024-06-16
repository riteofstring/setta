import asyncio
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor


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

    async def run(self, id, fn, as_subprocess, *args):
        await self.cancel_existing(id)
        executor = self.pool_executor if as_subprocess else self.thread_executor
        future = self.loop.run_in_executor(executor, fn, *args)
        self.tasks_dict[id] = future
        try:
            result = await future
            self.remove_task(id)
            return result
        except asyncio.CancelledError:
            self.remove_task(id)
            raise
