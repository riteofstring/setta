import pytest

from tests.utils.task_cleanup import cancel_spawned_background_tasks


@pytest.fixture(autouse=True)
def _cleanup_spawned_tasks(event_loop):
    yield
    event_loop.run_until_complete(cancel_spawned_background_tasks())

