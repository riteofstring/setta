import pytest_asyncio

from tests.utils.task_cleanup import cancel_spawned_background_tasks


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_spawned_tasks():
    yield
    await cancel_spawned_background_tasks()
