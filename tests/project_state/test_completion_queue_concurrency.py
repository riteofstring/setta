import asyncio
import contextvars
import unittest
from collections.abc import Coroutine
from asyncio import QueueEmpty
from types import SimpleNamespace

from setta.project_state.base_project_manager import BaseProjectManager
from setta.utils.async_rw_lock import AsyncReadWriteLock


class QueueIntegrationManager:
    def __init__(self):
        self.pending_frontend_ops: dict[str, None] = {}
        self._current_frontend_op_id = contextvars.ContextVar(
            "queue_integration_frontend_op_id", default=None
        )
        self._project_state_lock = AsyncReadWriteLock()
        self.message_queue: asyncio.Queue[
            tuple[Coroutine, asyncio.Future, str | None]
        ] = asyncio.Queue()
        self._process_queue_task_started = asyncio.Event()
        self._finalized: list[str] = []
        self.queue_task = asyncio.create_task(self._process_queue())

    @staticmethod
    def _extract_frontend_op_id(args, kwargs):
        return BaseProjectManager._extract_frontend_op_id(args, kwargs)

    async def _process_queue(self):
        self._process_queue_task_started.set()
        try:
            while True:
                coroutine, future, frontend_op_id = await self.message_queue.get()
                token = self._current_frontend_op_id.set(frontend_op_id)
                try:
                    result = await coroutine
                except Exception as exc:
                    self._finalize_frontend_op(frontend_op_id, success=False)
                    future.set_exception(exc)
                else:
                    self._finalize_frontend_op(frontend_op_id, success=True)
                    future.set_result(result)
                finally:
                    self.message_queue.task_done()
                    self._current_frontend_op_id.reset(token)
        except asyncio.CancelledError:
            self._process_queue_task_started.set()
            while True:
                try:
                    _, future, frontend_op_id = self.message_queue.get_nowait()
                except QueueEmpty:
                    break
                self._finalize_frontend_op(frontend_op_id, success=False)
                future.cancel()
                self.message_queue.task_done()
            raise

    async def _enqueue(
        self,
        coroutine: Coroutine,
        frontend_op_id: str | None = None,
    ):
        await self._process_queue_task_started.wait()
        future: asyncio.Future = asyncio.Future()
        if frontend_op_id:
            self.pending_frontend_ops[frontend_op_id] = None
        await self.message_queue.put((coroutine, future, frontend_op_id))
        return await future

    def _finalize_frontend_op(self, frontend_op_id: str | None, success: bool):
        if not frontend_op_id:
            return
        self.pending_frontend_ops.pop(frontend_op_id, None)
        if success:
            self._finalized.append(frontend_op_id)

    @BaseProjectManager.enqueue_method
    async def blocking_update(self, payload: SimpleNamespace):
        async with self._project_state_lock.write_lock():
            payload.started.set()
            await payload.release.wait()
            payload.completed.set()
            return payload.result

    @BaseProjectManager.enqueue_method(require_serialization=False)
    async def completion(self, payload: SimpleNamespace):
        async with self._project_state_lock.read_lock():
            payload.entered.set()
            await payload.release.wait()
            payload.completed.set()
            return payload.result

    async def shutdown(self):
        self.queue_task.cancel()
        try:
            await self.queue_task
        except asyncio.CancelledError:
            pass


class UpdateAndCompletionConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.manager = QueueIntegrationManager()

    async def asyncTearDown(self):
        await self.manager.shutdown()

    async def test_completion_waits_for_update_write_lock(self):
        manager = self.manager
        update_payload = SimpleNamespace(
            frontendOpId="update-op",
            started=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
            result="update-result",
        )

        update_task = asyncio.create_task(manager.blocking_update(update_payload))
        await update_payload.started.wait()
        self.assertIn("update-op", manager.pending_frontend_ops)

        completion_payload = SimpleNamespace(
            frontendOpId="completion-op",
            entered=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
            result="completion-result",
        )

        completion_task = asyncio.create_task(manager.completion(completion_payload))
        await asyncio.sleep(0)

        self.assertIn("completion-op", manager.pending_frontend_ops)
        self.assertFalse(completion_payload.entered.is_set())

        update_payload.release.set()
        await update_payload.completed.wait()
        await update_task

        self.assertNotIn("update-op", manager.pending_frontend_ops)
        await asyncio.wait_for(completion_payload.entered.wait(), timeout=1)
        self.assertIn("completion-op", manager.pending_frontend_ops)

        completion_payload.release.set()
        result = await completion_task

        self.assertEqual(result, "completion-result")
        self.assertTrue(completion_payload.completed.is_set())
        self.assertNotIn("completion-op", manager.pending_frontend_ops)
        self.assertEqual(manager._finalized, ["update-op", "completion-op"])
        self.assertIsNone(manager._current_frontend_op_id.get())


if __name__ == "__main__":
    unittest.main()
