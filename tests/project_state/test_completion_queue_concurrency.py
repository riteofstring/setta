import asyncio
import unittest
from contextlib import AsyncExitStack
from types import SimpleNamespace
from typing import Any, cast

from setta.project_state.base_project_manager import BaseProjectManager
from tests.utils.manager_fixture import real_settings_manager


@BaseProjectManager.enqueue_method
async def _blocking_update(self: BaseProjectManager, payload: SimpleNamespace):
    async with self._project_state_lock.write_lock():
        payload.started.set()
        await payload.release.wait()
        payload.completed.set()
        return payload.result


@BaseProjectManager.enqueue_method(require_serialization=False)
async def _non_serialized_completion(
    self: BaseProjectManager, payload: SimpleNamespace
):
    async with self._project_state_lock.read_lock():
        payload.entered.set()
    await payload.release.wait()
    payload.completed.set()
    return payload.result


class UpdateAndCompletionConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._exit_stack = AsyncExitStack()
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self.manager = fixture.manager
        self.manager_hooks = cast("Any", self.manager)
        project_config_id = self.manager.project_state_backend.defaultProjectConfigId
        self.assertIsNotNone(project_config_id)
        self.project_config_id = cast("str", project_config_id)

        # Bind helper coroutines onto the real manager so tests exercise the live queue.
        self.manager_hooks.blocking_update = _blocking_update.__get__(
            self.manager, type(self.manager)
        )
        self.manager_hooks.completion = _non_serialized_completion.__get__(
            self.manager, type(self.manager)
        )

        await self.manager.load_project_config(self.project_config_id)
        self.manager.completed_op_ids_since_last_broadcast.clear()

    async def asyncTearDown(self) -> None:
        await self._exit_stack.aclose()

    async def test_completion_waits_for_update_write_lock(self):
        manager = self.manager
        manager_hooks = self.manager_hooks
        update_payload = SimpleNamespace(
            frontendOpId="update-op",
            started=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
            result="update-result",
        )

        update_task = asyncio.create_task(manager_hooks.blocking_update(update_payload))
        await update_payload.started.wait()
        self.assertIn("update-op", manager.pending_frontend_ops)

        completion_payload = SimpleNamespace(
            frontendOpId="completion-op",
            entered=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
            result="completion-result",
        )

        completion_task = asyncio.create_task(
            manager_hooks.completion(completion_payload)
        )
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
        self.assertEqual(
            manager.completed_op_ids_since_last_broadcast,
            ["update-op", "completion-op"],
        )
        self.assertIsNone(manager._current_frontend_op_id.get())

    async def test_update_can_start_while_completion_waits_on_read(self):
        manager = self.manager
        manager_hooks = self.manager_hooks

        completion_payload = SimpleNamespace(
            frontendOpId="completion-op",
            entered=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
            result="completion-result",
        )

        completion_task = asyncio.create_task(
            manager_hooks.completion(completion_payload)
        )
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

        update_task = asyncio.create_task(manager_hooks.blocking_update(update_payload))
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
        self.assertEqual(
            manager.completed_op_ids_since_last_broadcast,
            ["update-op", "completion-op"],
        )
        self.assertIsNone(manager._current_frontend_op_id.get())

    async def test_write_lock_available_while_completion_waits(self):
        manager = self.manager
        manager_hooks = self.manager_hooks

        completion_payload = SimpleNamespace(
            frontendOpId="completion-op",
            entered=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
            result="completion-result",
        )

        completion_task = asyncio.create_task(
            manager_hooks.completion(completion_payload)
        )
        await asyncio.wait_for(completion_payload.entered.wait(), timeout=1)

        write_lock_acquired = asyncio.Event()
        release_write_lock = asyncio.Event()

        async def acquire_write_lock():
            async with manager._project_state_lock.write_lock():
                write_lock_acquired.set()
                await release_write_lock.wait()

        write_task = asyncio.create_task(acquire_write_lock())

        try:
            await asyncio.wait_for(write_lock_acquired.wait(), timeout=0.2)
        except asyncio.TimeoutError as exc:  # pragma: no cover - aids local debugging
            release_write_lock.set()
            completion_payload.release.set()
            await asyncio.gather(write_task, completion_task)
            raise AssertionError(
                "Write lock was blocked by completion's wait state."
            ) from exc

        release_write_lock.set()
        completion_payload.release.set()
        await asyncio.gather(write_task, completion_task)
        self.assertNotIn("completion-op", manager.pending_frontend_ops)
        self.assertEqual(
            manager.completed_op_ids_since_last_broadcast, ["completion-op"]
        )
        self.assertIsNone(manager._current_frontend_op_id.get())
