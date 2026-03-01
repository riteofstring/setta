import asyncio
from contextlib import AsyncExitStack
from types import SimpleNamespace
from typing import Any, Awaitable, Callable, cast

import pytest
import pytest_asyncio
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import (
    GetLatestProjectStateRequest,
    GetLatestProjectStateSummaryRequest,
)
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


@BaseProjectManager.enqueue_method
async def _serialized_queue_blocker(
    _self: BaseProjectManager, payload: SimpleNamespace
):
    payload.started.set()
    await payload.release.wait()
    payload.completed.set()


@BaseProjectManager.enqueue_method(require_serialization=False)
async def _write_lock_blocker(self: BaseProjectManager, payload: SimpleNamespace):
    async with self._project_state_lock.write_lock():
        payload.started.set()
        await payload.release.wait()
    payload.completed.set()


ReadEndpointCall = Callable[[BaseProjectManager, str, str], Awaitable[Any]]


def _call_get_latest_project_state(
    manager: BaseProjectManager,
    project_config_id: str,
    frontend_op_id: str,
) -> Awaitable[Any]:
    return manager.get_latest_project_state(
        GetLatestProjectStateRequest(
            projectConfigId=project_config_id,
            frontendOpId=frontend_op_id,
        )
    )


def _call_get_latest_project_state_summary(
    manager: BaseProjectManager,
    project_config_id: str,
    frontend_op_id: str,
) -> Awaitable[Any]:
    return manager.get_latest_project_state_summary(
        GetLatestProjectStateSummaryRequest(
            projectConfigId=project_config_id,
            frontendOpId=frontend_op_id,
        )
    )


@pytest.mark.asyncio
class TestUpdateAndCompletionConcurrency:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self) -> None:
        self._exit_stack = AsyncExitStack()
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self.manager = fixture.manager
        self.manager_hooks = cast("Any", self.manager)
        project_config_id = self.manager.project_state_backend.defaultProjectConfigId
        assert project_config_id is not None
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

        yield

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
        assert "update-op" in manager.pending_frontend_ops

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

        assert "completion-op" in manager.pending_frontend_ops
        assert not completion_payload.entered.is_set()

        update_payload.release.set()
        await update_payload.completed.wait()
        await update_task

        assert "update-op" not in manager.pending_frontend_ops
        await asyncio.wait_for(completion_payload.entered.wait(), timeout=1)
        assert "completion-op" in manager.pending_frontend_ops

        completion_payload.release.set()
        result = await completion_task

        assert result == "completion-result"
        assert completion_payload.completed.is_set()
        assert "completion-op" not in manager.pending_frontend_ops
        assert manager.completed_op_ids_since_last_broadcast == [
            "update-op",
            "completion-op",
        ]
        assert manager._current_frontend_op_id.get() is None

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
        assert "completion-op" in manager.pending_frontend_ops
        assert not completion_payload.completed.is_set()

        update_payload = SimpleNamespace(
            frontendOpId="update-op",
            started=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
            result="update-result",
        )

        update_task = asyncio.create_task(manager_hooks.blocking_update(update_payload))
        await asyncio.wait_for(update_payload.started.wait(), timeout=1)
        assert "update-op" in manager.pending_frontend_ops
        assert not completion_payload.completed.is_set()

        update_payload.release.set()
        await asyncio.wait_for(update_payload.completed.wait(), timeout=1)
        await update_task
        assert "update-op" not in manager.pending_frontend_ops

        assert not completion_payload.completed.is_set()
        completion_payload.release.set()
        completion_result = await completion_task

        assert completion_result == "completion-result"
        assert completion_payload.completed.is_set()
        assert "completion-op" not in manager.pending_frontend_ops
        assert manager.completed_op_ids_since_last_broadcast == [
            "update-op",
            "completion-op",
        ]
        assert manager._current_frontend_op_id.get() is None

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
        assert "completion-op" not in manager.pending_frontend_ops
        assert manager.completed_op_ids_since_last_broadcast == ["completion-op"]
        assert manager._current_frontend_op_id.get() is None


@pytest.mark.asyncio
class TestReadEndpointConcurrency:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self) -> None:
        self._exit_stack = AsyncExitStack()
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self.manager = fixture.manager
        self.manager_hooks = cast("Any", self.manager)
        project_config_id = self.manager.project_state_backend.defaultProjectConfigId
        assert project_config_id is not None
        self.project_config_id = cast("str", project_config_id)

        # Bind helper coroutines onto the real manager so tests exercise the live queue.
        self.manager_hooks.serialized_queue_blocker = _serialized_queue_blocker.__get__(
            self.manager, type(self.manager)
        )
        self.manager_hooks.write_lock_blocker = _write_lock_blocker.__get__(
            self.manager, type(self.manager)
        )

        await self.manager.load_project_config(self.project_config_id)
        self.manager.completed_op_ids_since_last_broadcast.clear()

        yield

        await self._exit_stack.aclose()

    @pytest.mark.parametrize(
        "read_call",
        [
            _call_get_latest_project_state,
            _call_get_latest_project_state_summary,
        ],
    )
    async def test_read_endpoint_bypasses_serialized_queue_blocker(
        self,
        read_call: ReadEndpointCall,
    ) -> None:
        manager = self.manager
        manager_hooks = self.manager_hooks
        queue_payload = SimpleNamespace(
            frontendOpId="queue-blocker",
            started=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
        )
        queue_task = asyncio.create_task(
            manager_hooks.serialized_queue_blocker(queue_payload)
        )
        await asyncio.wait_for(queue_payload.started.wait(), timeout=1)
        assert "queue-blocker" in manager.pending_frontend_ops

        read_frontend_op_id = "read-op"
        read_result = await asyncio.wait_for(
            asyncio.create_task(
                read_call(manager, self.project_config_id, read_frontend_op_id)
            ),
            timeout=1,
        )

        assert read_result.projectConfig.id == self.project_config_id
        assert "queue-blocker" in manager.pending_frontend_ops
        assert read_frontend_op_id not in manager.pending_frontend_ops
        assert manager.completed_op_ids_since_last_broadcast == [read_frontend_op_id]

        queue_payload.release.set()
        await asyncio.wait_for(queue_payload.completed.wait(), timeout=1)
        await queue_task

        assert manager.pending_frontend_ops == {}
        assert manager.completed_op_ids_since_last_broadcast == [
            read_frontend_op_id,
            "queue-blocker",
        ]
        assert manager._current_frontend_op_id.get() is None

    @pytest.mark.parametrize(
        "read_call",
        [
            _call_get_latest_project_state,
            _call_get_latest_project_state_summary,
        ],
    )
    async def test_read_endpoint_waits_for_active_write_lock(
        self,
        read_call: ReadEndpointCall,
    ) -> None:
        manager = self.manager
        manager_hooks = self.manager_hooks
        write_payload = SimpleNamespace(
            frontendOpId="write-lock",
            started=asyncio.Event(),
            release=asyncio.Event(),
            completed=asyncio.Event(),
        )
        write_task = asyncio.create_task(
            manager_hooks.write_lock_blocker(write_payload)
        )
        await asyncio.wait_for(write_payload.started.wait(), timeout=1)
        assert "write-lock" in manager.pending_frontend_ops

        read_frontend_op_id = "read-op"
        read_task = asyncio.create_task(
            read_call(manager, self.project_config_id, read_frontend_op_id)
        )

        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(asyncio.shield(read_task), timeout=0.05)
        assert read_frontend_op_id in manager.pending_frontend_ops
        assert manager.completed_op_ids_since_last_broadcast == []

        write_payload.release.set()
        await asyncio.wait_for(write_payload.completed.wait(), timeout=1)
        await write_task
        read_result = await asyncio.wait_for(read_task, timeout=1)

        assert read_result.projectConfig.id == self.project_config_id
        assert manager.pending_frontend_ops == {}
        assert set(manager.completed_op_ids_since_last_broadcast) == {
            read_frontend_op_id,
            "write-lock",
        }
        assert manager._current_frontend_op_id.get() is None
