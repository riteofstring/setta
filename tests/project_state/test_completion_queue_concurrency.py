import asyncio
import contextvars
import unittest
from asyncio import QueueEmpty
from collections.abc import Coroutine
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

    async def test_update_can_start_while_completion_waits_on_lsp(self):
        manager = self.manager

        completion_payload = SimpleNamespace(
            frontendOpId="completion-op",
            entered=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
            result="completion-result",
        )

        completion_task = asyncio.create_task(manager.completion(completion_payload))
        await asyncio.wait_for(completion_payload.entered.wait(), timeout=1)
        self.assertIn("completion-op", manager.pending_frontend_ops)
        self.assertFalse(completion_payload.completed.is_set())

        update_payload = SimpleNamespace(
            frontendOpId="update-op",
            started=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
            result="update-result",
        )

        update_task = asyncio.create_task(manager.blocking_update(update_payload))
        await asyncio.wait_for(update_payload.started.wait(), timeout=1)
        self.assertIn("update-op", manager.pending_frontend_ops)
        self.assertFalse(completion_payload.completed.is_set())

        update_payload.release.set()
        await asyncio.wait_for(update_payload.completed.wait(), timeout=1)
        await update_task
        self.assertNotIn("update-op", manager.pending_frontend_ops)

        self.assertFalse(completion_payload.completed.is_set())
        completion_payload.release.set()
        completion_result = await completion_task

        self.assertEqual(completion_result, "completion-result")
        self.assertTrue(completion_payload.completed.is_set())
        self.assertNotIn("completion-op", manager.pending_frontend_ops)
        self.assertEqual(manager._finalized, ["update-op", "completion-op"])
        self.assertIsNone(manager._current_frontend_op_id.get())


class StubGenCode:
    def __init__(self):
        self.started = asyncio.Event()
        self.allow_finish = asyncio.Event()

    async def text_field_completion(
        self,
        section_id: str,
        param_info_id: str | None,
        full_text: str,
        position: int,
    ):
        self.started.set()
        await self.allow_finish.wait()
        return ["ok"]


class MinimalBaseProjectManager(BaseProjectManager):
    def __init__(self):
        # Minimal subset of BaseProjectManager setup required for the decorator
        # to run; we bypass queue management entirely for this isolated test.
        self._project_state_lock = AsyncReadWriteLock()
        self.pending_frontend_ops: dict[str, None] = {}
        self.completed_op_ids_since_last_broadcast: list[str] = []
        self._current_frontend_op_id = contextvars.ContextVar(
            "minimal_current_frontend_op_id", default=None
        )
        self.gen_code: dict[str, StubGenCode] = {}
        self.code_dict = {}

    def load_initial_state(self):
        raise NotImplementedError

    def save(self):
        raise NotImplementedError

    async def save_as_new_project_config(self, x):
        raise NotImplementedError

    def save_as_existing_project_config(self, x):
        raise NotImplementedError


class BaseProjectManagerLockingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.manager = MinimalBaseProjectManager()
        self.stub = StubGenCode()
        self.manager.gen_code["project"] = self.stub

    async def asyncTearDown(self):
        self.stub.allow_finish.set()

    async def test_write_lock_available_while_completion_waits(self):
        manager = self.manager
        stub = self.stub
        request = SimpleNamespace(
            frontendOpId="completion-op",
            projectConfigId="project",
            sectionId="section",
            paramInfoId=None,
            fullText="code",
            position=0,
        )

        completion_task = asyncio.create_task(manager.text_field_completion(request))
        await asyncio.wait_for(stub.started.wait(), timeout=1)

        write_lock_acquired = asyncio.Event()
        release_write_lock = asyncio.Event()

        async def acquire_write_lock():
            async with manager._project_state_lock.write_lock():
                write_lock_acquired.set()
                await release_write_lock.wait()

        write_task = asyncio.create_task(acquire_write_lock())

        try:
            await asyncio.wait_for(write_lock_acquired.wait(), timeout=0.2)
        except asyncio.TimeoutError as exc:
            release_write_lock.set()
            stub.allow_finish.set()
            await asyncio.gather(write_task, completion_task)
            raise AssertionError(
                "Write lock was blocked by completion's LSP wait."
            ) from exc

        release_write_lock.set()
        stub.allow_finish.set()
        await asyncio.gather(write_task, completion_task)


if __name__ == "__main__":
    unittest.main()
