import asyncio
import contextvars
import unittest
from types import SimpleNamespace

from setta.project_state.base_project_manager import BaseProjectManager


class DummyManager:
    def __init__(self):
        self.pending_frontend_ops: dict[str, None] = {}
        self._current_frontend_op_id = contextvars.ContextVar(
            "dummy_current_frontend_op_id", default=None
        )
        self._enqueue_calls = 0
        self._finalized: list[str] = []
        self.started: list[str] = []
        self.finished: list[str] = []

    @staticmethod
    def _extract_frontend_op_id(args, kwargs):
        return BaseProjectManager._extract_frontend_op_id(args, kwargs)

    async def _enqueue(self, coroutine, frontend_op_id=None):
        self._enqueue_calls += 1
        return await coroutine

    def _finalize_frontend_op(self, frontend_op_id, success: bool):
        if not frontend_op_id:
            return
        self.pending_frontend_ops.pop(frontend_op_id, None)
        if success:
            self._finalized.append(frontend_op_id)

    @BaseProjectManager.enqueue_method
    async def serialized(self, value):
        return value

    @BaseProjectManager.enqueue_method(require_serialization=False)
    async def non_serialized(self, payload):
        await asyncio.sleep(0)
        return payload.value

    @BaseProjectManager.enqueue_method(require_serialization=False)
    async def non_serialized_blocking(self, payload):
        self.started.append(payload.frontendOpId)
        await payload.event.wait()
        self.finished.append(payload.frontendOpId)
        return payload.value


class EnqueueMethodTests(unittest.IsolatedAsyncioTestCase):
    async def test_serialized_uses_queue(self):
        manager = DummyManager()
        result = await manager.serialized(42)
        self.assertEqual(result, 42)
        self.assertEqual(manager._enqueue_calls, 1)

    async def test_non_serialized_bypasses_queue_and_tracks_frontend_id(self):
        manager = DummyManager()
        payload = SimpleNamespace(frontendOpId="abc123", value=7)
        result = await manager.non_serialized(payload)
        self.assertEqual(result, 7)
        self.assertEqual(manager._enqueue_calls, 0)
        self.assertEqual(manager.pending_frontend_ops, {})
        self.assertEqual(manager._finalized, ["abc123"])
        self.assertIsNone(manager._current_frontend_op_id.get())

    async def test_non_serialized_runs_concurrently(self):
        manager = DummyManager()
        event1 = asyncio.Event()
        event2 = asyncio.Event()
        payload1 = SimpleNamespace(frontendOpId="op1", value=1, event=event1)
        payload2 = SimpleNamespace(frontendOpId="op2", value=2, event=event2)

        task1 = asyncio.create_task(manager.non_serialized_blocking(payload1))
        await asyncio.sleep(0)
        task2 = asyncio.create_task(manager.non_serialized_blocking(payload2))
        await asyncio.sleep(0)

        self.assertCountEqual(manager.started, ["op1", "op2"])
        self.assertEqual(set(manager.pending_frontend_ops.keys()), {"op1", "op2"})

        event1.set()
        event2.set()
        results = await asyncio.gather(task1, task2)

        self.assertEqual(results, [1, 2])
        self.assertEqual(set(manager.finished), {"op1", "op2"})
        self.assertEqual(manager.pending_frontend_ops, {})
        self.assertEqual(set(manager._finalized), {"op1", "op2"})


if __name__ == "__main__":
    unittest.main()
