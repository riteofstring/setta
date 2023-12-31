import asyncio
from concurrent.futures import ProcessPoolExecutor


class Tasks:
    def __init__(self):
        self.executor = ProcessPoolExecutor()
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
