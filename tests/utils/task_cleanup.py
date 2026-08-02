import asyncio


async def cancel_spawned_background_tasks() -> None:
    current_task = asyncio.current_task()
    tasks: list[asyncio.Task] = []
    for task in asyncio.all_tasks():
        if task is current_task or task.done():
            continue
        coro = task.get_coro()
        qualname = getattr(coro, "__qualname__", "")
        if "spawn_background_task.<locals>._runner" in qualname:
            tasks.append(task)
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
