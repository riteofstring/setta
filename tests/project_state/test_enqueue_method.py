import asyncio
import unittest
from contextlib import AsyncExitStack
from types import SimpleNamespace

from setta.project_state.base_project_manager import BaseProjectManager

from tests.utils.manager_fixture import real_settings_manager


@BaseProjectManager.enqueue_method
async def _serialized_blocking(
    self: BaseProjectManager, payload: SimpleNamespace
) -> int:
    self.serialized_started.append(payload.frontendOpId)
    payload.entered.set()
    await payload.release.wait()
    self.serialized_finished.append(payload.frontendOpId)
    payload.completed.set()
    return payload.value


@BaseProjectManager.enqueue_method(require_serialization=False)
async def _non_serialized_blocking(
    self: BaseProjectManager, payload: SimpleNamespace
) -> int:
    self.non_serialized_started.append(payload.frontendOpId)
    await payload.event.wait()
    self.non_serialized_finished.append(payload.frontendOpId)
    return payload.value


class EnqueueMethodTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._exit_stack = AsyncExitStack()
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self.manager = fixture.manager
        self.project_config_id = (
            self.manager.project_state_backend.defaultProjectConfigId
        )

        # Prepare tracking state used by test helpers.
        self.manager.serialized_started = []
        self.manager.serialized_finished = []
        self.manager.non_serialized_started = []
        self.manager.non_serialized_finished = []

        # Bind helper coroutines onto the real manager so we exercise the live queue.
        self.manager.serialized_blocking = _serialized_blocking.__get__(
            self.manager, type(self.manager)
        )
        self.manager.non_serialized_blocking = _non_serialized_blocking.__get__(
            self.manager, type(self.manager)
        )

        await self.manager.load_project_config(self.project_config_id)
        self.manager.completed_op_ids_since_last_broadcast.clear()

    async def asyncTearDown(self):
        await self._exit_stack.aclose()

    async def test_serialized_runs_sequentially(self):
        manager = self.manager
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

        task1 = asyncio.create_task(manager.serialized_blocking(payload1))
        await asyncio.wait_for(payload1.entered.wait(), timeout=1)
        self.assertIn("serialized-1", manager.pending_frontend_ops)

        task2 = asyncio.create_task(manager.serialized_blocking(payload2))
        await asyncio.sleep(0)
        self.assertFalse(
            payload2.entered.is_set(),
            "Second serialized call should wait for the queue to drain.",
        )
        self.assertIn("serialized-2", manager.pending_frontend_ops)

        payload1.release.set()
        await asyncio.wait_for(payload1.completed.wait(), timeout=1)
        self.assertIn("serialized-1", manager.serialized_finished)
        await task1

        await asyncio.wait_for(payload2.entered.wait(), timeout=1)
        self.assertEqual(manager.serialized_started, ["serialized-1", "serialized-2"])
        payload2.release.set()
        await asyncio.wait_for(payload2.completed.wait(), timeout=1)
        result2 = await task2

        self.assertEqual(result2, 2)
        self.assertEqual(manager.pending_frontend_ops, {})
        self.assertEqual(
            manager.completed_op_ids_since_last_broadcast,
            ["serialized-1", "serialized-2"],
        )
        self.assertIsNone(manager._current_frontend_op_id.get())

    async def test_non_serialized_tracks_frontend_id(self):
        manager = self.manager
        manager.completed_op_ids_since_last_broadcast.clear()

        payload = SimpleNamespace(frontendOpId="abc123", value=7, event=asyncio.Event())
        task = asyncio.create_task(manager.non_serialized_blocking(payload))
        await asyncio.sleep(0)
        self.assertIn("abc123", manager.pending_frontend_ops)
        payload.event.set()
        result = await task

        self.assertEqual(result, 7)
        self.assertEqual(manager.pending_frontend_ops, {})
        self.assertEqual(manager.non_serialized_started, ["abc123"])
        self.assertEqual(manager.non_serialized_finished, ["abc123"])
        self.assertEqual(manager.completed_op_ids_since_last_broadcast, ["abc123"])
        self.assertIsNone(manager._current_frontend_op_id.get())

    async def test_non_serialized_runs_concurrently(self):
        manager = self.manager
        manager.completed_op_ids_since_last_broadcast.clear()

        event1 = asyncio.Event()
        event2 = asyncio.Event()
        payload1 = SimpleNamespace(frontendOpId="op1", value=1, event=event1)
        payload2 = SimpleNamespace(frontendOpId="op2", value=2, event=event2)

        task1 = asyncio.create_task(manager.non_serialized_blocking(payload1))
        task2 = asyncio.create_task(manager.non_serialized_blocking(payload2))
        await asyncio.sleep(0)

        self.assertCountEqual(manager.non_serialized_started, ["op1", "op2"])
        self.assertEqual(set(manager.pending_frontend_ops.keys()), {"op1", "op2"})

        event1.set()
        event2.set()
        results = await asyncio.gather(task1, task2)

        self.assertEqual(results, [1, 2])
        self.assertEqual(set(manager.non_serialized_finished), {"op1", "op2"})
        self.assertEqual(manager.pending_frontend_ops, {})
        self.assertEqual(
            set(manager.completed_op_ids_since_last_broadcast), {"op1", "op2"}
        )
        self.assertIsNone(manager._current_frontend_op_id.get())


if __name__ == "__main__":
    unittest.main()
