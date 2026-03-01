import asyncio
from contextlib import AsyncExitStack
from types import SimpleNamespace
from typing import Any, cast

import pytest
import pytest_asyncio
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import SetCallableHideParamsRequest
from setta.types.id import ID

from tests.utils.manager_fixture import real_settings_manager


@BaseProjectManager.enqueue_method
async def _serialized_blocking(
    self: BaseProjectManager, payload: SimpleNamespace
) -> int:
    manager = cast("Any", self)
    manager.serialized_started.append(payload.frontendOpId)
    payload.entered.set()
    await payload.release.wait()
    manager.serialized_finished.append(payload.frontendOpId)
    payload.completed.set()
    return payload.value


@BaseProjectManager.enqueue_method(require_serialization=False)
async def _non_serialized_blocking(
    self: BaseProjectManager, payload: SimpleNamespace
) -> int:
    manager = cast("Any", self)
    manager.non_serialized_started.append(payload.frontendOpId)
    await payload.event.wait()
    manager.non_serialized_finished.append(payload.frontendOpId)
    return payload.value


@pytest.mark.asyncio
class TestEnqueueMethod:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._exit_stack = AsyncExitStack()
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self.manager = fixture.manager
        self.project_config_id = (
            self.manager.project_state_backend.defaultProjectConfigId
        )
        self.manager_hooks = cast("Any", self.manager)

        # Prepare tracking state used by test helpers.
        self.manager_hooks.serialized_started = []
        self.manager_hooks.serialized_finished = []
        self.manager_hooks.non_serialized_started = []
        self.manager_hooks.non_serialized_finished = []

        # Bind helper coroutines onto the real manager so we exercise the live queue.
        self.manager_hooks.serialized_blocking = _serialized_blocking.__get__(
            self.manager, type(self.manager)
        )
        self.manager_hooks.non_serialized_blocking = _non_serialized_blocking.__get__(
            self.manager, type(self.manager)
        )

        await self.manager.load_project_config(self.project_config_id)
        self.manager.completed_op_ids_since_last_broadcast.clear()

        yield

        await self._exit_stack.aclose()

    async def test_serialized_runs_sequentially(self):
        manager = self.manager
        manager_hooks = self.manager_hooks
        payload1 = SimpleNamespace(
            frontendOpId="serialized-1",
            value=1,
            release=asyncio.Event(),
            entered=asyncio.Event(),
            completed=asyncio.Event(),
        )
        payload2 = SimpleNamespace(
            frontendOpId="serialized-2",
            value=2,
            release=asyncio.Event(),
            entered=asyncio.Event(),
            completed=asyncio.Event(),
        )

        task1 = asyncio.create_task(manager_hooks.serialized_blocking(payload1))
        await asyncio.wait_for(payload1.entered.wait(), timeout=1)
        assert "serialized-1" in manager.pending_frontend_ops

        task2 = asyncio.create_task(manager_hooks.serialized_blocking(payload2))
        await asyncio.sleep(0)
        assert not payload2.entered.is_set(), (
            "Second serialized call should wait for the queue to drain."
        )
        assert "serialized-2" in manager.pending_frontend_ops

        payload1.release.set()
        await asyncio.wait_for(payload1.completed.wait(), timeout=1)
        assert "serialized-1" in manager_hooks.serialized_finished
        await task1

        await asyncio.wait_for(payload2.entered.wait(), timeout=1)
        assert manager_hooks.serialized_started == ["serialized-1", "serialized-2"]
        payload2.release.set()
        await asyncio.wait_for(payload2.completed.wait(), timeout=1)
        result2 = await task2

        assert result2 == 2
        assert manager.pending_frontend_ops == {}
        assert manager.completed_op_ids_since_last_broadcast == [
            "serialized-1",
            "serialized-2",
        ]
        assert manager._current_frontend_op_id.get() is None

    async def test_non_serialized_tracks_frontend_id(self):
        manager = self.manager
        manager_hooks = self.manager_hooks
        manager.completed_op_ids_since_last_broadcast.clear()

        payload = SimpleNamespace(frontendOpId="abc123", value=7, event=asyncio.Event())
        task = asyncio.create_task(manager_hooks.non_serialized_blocking(payload))
        await asyncio.sleep(0)
        assert "abc123" in manager.pending_frontend_ops
        payload.event.set()
        result = await task

        assert result == 7
        assert manager.pending_frontend_ops == {}
        assert manager_hooks.non_serialized_started == ["abc123"]
        assert manager_hooks.non_serialized_finished == ["abc123"]
        assert manager.completed_op_ids_since_last_broadcast == ["abc123"]
        assert manager._current_frontend_op_id.get() is None

    async def test_non_serialized_runs_concurrently(self):
        manager = self.manager
        manager_hooks = self.manager_hooks
        manager.completed_op_ids_since_last_broadcast.clear()

        event1 = asyncio.Event()
        event2 = asyncio.Event()
        payload1 = SimpleNamespace(frontendOpId="op1", value=1, event=event1)
        payload2 = SimpleNamespace(frontendOpId="op2", value=2, event=event2)

        task1 = asyncio.create_task(manager_hooks.non_serialized_blocking(payload1))
        task2 = asyncio.create_task(manager_hooks.non_serialized_blocking(payload2))
        await asyncio.sleep(0)

        assert sorted(manager_hooks.non_serialized_started) == ["op1", "op2"]
        assert set(manager.pending_frontend_ops.keys()) == {"op1", "op2"}

        event1.set()
        event2.set()
        results = await asyncio.gather(task1, task2)

        assert results == [1, 2]
        assert set(manager_hooks.non_serialized_finished) == {"op1", "op2"}
        assert manager.pending_frontend_ops == {}
        assert set(manager.completed_op_ids_since_last_broadcast) == {"op1", "op2"}
        assert manager._current_frontend_op_id.get() is None

    async def test_queue_timing_metrics_capture_wait_and_execute_paths(self):
        manager = self.manager
        manager_hooks = self.manager_hooks
        manager.reset_queue_timing_metrics()

        payload1 = SimpleNamespace(
            frontendOpId="metrics-serialized-1",
            value=1,
            release=asyncio.Event(),
            entered=asyncio.Event(),
            completed=asyncio.Event(),
        )
        payload2 = SimpleNamespace(
            frontendOpId="metrics-serialized-2",
            value=2,
            release=asyncio.Event(),
            entered=asyncio.Event(),
            completed=asyncio.Event(),
        )

        # First request occupies the serialized queue so the second request waits.
        task1 = asyncio.create_task(manager_hooks.serialized_blocking(payload1))
        await asyncio.wait_for(payload1.entered.wait(), timeout=1)
        task2 = asyncio.create_task(manager_hooks.serialized_blocking(payload2))
        await asyncio.sleep(0)

        payload1.release.set()
        await asyncio.wait_for(payload1.completed.wait(), timeout=1)
        await asyncio.wait_for(payload2.entered.wait(), timeout=1)
        payload2.release.set()
        await asyncio.wait_for(payload2.completed.wait(), timeout=1)
        await asyncio.gather(task1, task2)

        snapshot = manager.get_queue_timing_metrics_snapshot()
        assert snapshot["queueDepth"] == 0
        assert snapshot["calls"] == 2
        assert snapshot["successes"] == 2
        assert snapshot["failures"] == 0

        queue_wait_snapshot = cast("dict[str, object]", snapshot["queueWaitSeconds"])
        assert queue_wait_snapshot["count"] == 2
        assert cast("float", queue_wait_snapshot["maxSeconds"]) > 0

        by_handler = cast("dict[str, object]", snapshot["byHandler"])
        assert "_serialized_blocking" in by_handler
        serialized_handler_snapshot = cast(
            "dict[str, object]",
            by_handler["_serialized_blocking"],
        )
        assert serialized_handler_snapshot["calls"] == 2
        assert serialized_handler_snapshot["successes"] == 2
        assert serialized_handler_snapshot["failures"] == 0

    async def test_queue_timing_metrics_capture_failures(self):
        manager = self.manager
        manager.reset_queue_timing_metrics()

        async def fail() -> None:
            raise RuntimeError("queue failure")

        # Failure paths should still record queue wait/execute timings.
        with pytest.raises(RuntimeError, match="queue failure"):
            await manager._enqueue(fail())

        snapshot = manager.get_queue_timing_metrics_snapshot()
        assert snapshot["calls"] == 1
        assert snapshot["successes"] == 0
        assert snapshot["failures"] == 1
        assert "fail" in cast("dict[str, object]", snapshot["byHandler"])

    async def test_broadcast_status_omits_pending_op_ids_payload(self):
        manager = self.manager
        manager._register_pending_frontend_op("pending-op-id")

        # Pending frontend-op tracking remains internal, but transport payload
        # intentionally omits pending ids to keep patch sizes bounded.
        completed_op_ids, pending_op_ids = (
            manager._consume_frontend_op_status_for_broadcast()
        )
        assert completed_op_ids == []
        assert pending_op_ids == []
        assert "pending-op-id" in manager.pending_frontend_ops

    async def test_set_callable_hide_params_completes_without_queue_stall(self):
        manager = self.manager
        request = SetCallableHideParamsRequest(
            projectConfigId=self.project_config_id,
            sectionId=ID("missing-section"),
            hideParams=True,
            frontendOpId="hide-params",
        )

        # Even when the section is missing, queue execution should complete quickly.
        with pytest.raises(KeyError):
            await asyncio.wait_for(
                manager.set_callable_hide_params(request),
                timeout=1,
            )

        assert manager.pending_frontend_ops == {}
        assert manager._current_frontend_op_id.get() is None
