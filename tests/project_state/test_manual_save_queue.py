import asyncio
import threading
import types
from typing import Awaitable, Callable, cast
from unittest.mock import patch

import pytest
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import SetWatchCodeEnabledRequest
from setta.types.id import ID

from tests.utils.manager_fixture import (
    real_project_manager,
    real_settings_manager,
)


OriginalSetWatchCodeEnabled = Callable[
    [BaseProjectManager, SetWatchCodeEnabledRequest], Awaitable[None]
]


def _bind_delayed_set_watch_code_enabled(
    manager: BaseProjectManager, *, delay: float = 0.05
):
    maybe_original = getattr(
        BaseProjectManager.set_watch_code_enabled, "__wrapped__", None
    )
    if maybe_original is None or not callable(maybe_original):
        raise TypeError("set_watch_code_enabled.__wrapped__ must be callable")
    original: OriginalSetWatchCodeEnabled = cast(
        "OriginalSetWatchCodeEnabled", maybe_original
    )

    @BaseProjectManager.enqueue_method
    async def delayed_set_watch_code_enabled(
        self: BaseProjectManager, request: SetWatchCodeEnabledRequest
    ) -> None:
        await asyncio.sleep(delay)
        await original(self, request)

    return types.MethodType(delayed_set_watch_code_enabled, manager)


@pytest.mark.asyncio
class TestManualSaveQueueDrain:
    async def test_settings_manual_save_waits_for_pending_ops(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            delayed_method = _bind_delayed_set_watch_code_enabled(manager)

            default_config_id = manager.project_state_backend.defaultProjectConfigId
            assert default_config_id is not None
            default_config_id = ID(default_config_id)

            original_watch_code_enabled = manager.project_state_backend.projectConfigs[
                default_config_id
            ].watchCodeEnabled
            new_watch_code_enabled = not original_watch_code_enabled

            request = SetWatchCodeEnabledRequest(
                projectConfigId=default_config_id,
                enabled=new_watch_code_enabled,
                frontendOpId="settings-op",
            )

            on_disk_before = fixture.dbe.read_settings_project()
            assert (
                on_disk_before.projectConfig.watchCodeEnabled
                == original_watch_code_enabled
            )

            op_task = asyncio.create_task(delayed_method(request))
            await asyncio.sleep(0)
            assert "settings-op" in manager.pending_frontend_ops
            assert not op_task.done()

            await manager.finish_pending_operations()
            await op_task

            assert "settings-op" not in manager.pending_frontend_ops
            assert (
                manager.project_state_backend.projectConfigs[
                    default_config_id
                ].watchCodeEnabled
                == new_watch_code_enabled
            )

            on_disk_before_save = fixture.dbe.read_settings_project()
            assert (
                on_disk_before_save.projectConfig.watchCodeEnabled
                == original_watch_code_enabled
            )

            manager.perform_manual_save()

            on_disk_after = fixture.dbe.read_settings_project()
            assert (
                on_disk_after.projectConfig.watchCodeEnabled == new_watch_code_enabled
            )

    async def test_project_manual_save_waits_for_pending_ops(self):
        async with real_project_manager() as fixture:
            manager = fixture.manager
            delayed_method = _bind_delayed_set_watch_code_enabled(manager)

            default_config_id = manager.project_state_backend.defaultProjectConfigId
            assert default_config_id is not None
            default_config_id = ID(default_config_id)

            original_watch_code_enabled = manager.project_state_backend.projectConfigs[
                default_config_id
            ].watchCodeEnabled
            new_watch_code_enabled = not original_watch_code_enabled

            request = SetWatchCodeEnabledRequest(
                projectConfigId=default_config_id,
                enabled=new_watch_code_enabled,
                frontendOpId="project-op",
            )

            on_disk_before = fixture.dbe.read_project()
            assert (
                on_disk_before.projectConfigs[default_config_id].watchCodeEnabled
                == original_watch_code_enabled
            )

            op_task = asyncio.create_task(delayed_method(request))
            await asyncio.sleep(0)
            assert "project-op" in manager.pending_frontend_ops
            assert not op_task.done()

            await manager.finish_pending_operations()
            await op_task

            assert "project-op" not in manager.pending_frontend_ops
            assert (
                manager.project_state_backend.projectConfigs[
                    default_config_id
                ].watchCodeEnabled
                == new_watch_code_enabled
            )

            on_disk_before_save = fixture.dbe.read_project()
            assert (
                on_disk_before_save.projectConfigs[default_config_id].watchCodeEnabled
                == original_watch_code_enabled
            )

            manager.perform_manual_save()

            on_disk_after = fixture.dbe.read_project()
            assert (
                on_disk_after.projectConfigs[default_config_id].watchCodeEnabled
                == new_watch_code_enabled
            )


@pytest.mark.asyncio
class TestManualSaveWriteDeduping:
    async def test_settings_manual_save_skips_duplicate_disk_writes(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager

            with (
                patch.object(
                    fixture.dbe,
                    "write_settings_project",
                    wraps=fixture.dbe.write_settings_project,
                ) as write_settings_project,
                patch.object(
                    fixture.artifacts,
                    "save",
                    wraps=fixture.artifacts.save,
                ) as save_artifacts,
            ):
                # First manual save persists the current revision.
                manager.perform_manual_save()
                # Re-saving without changes should be a no-op on disk.
                manager.perform_manual_save()

            assert write_settings_project.call_count == 1
            assert save_artifacts.call_count == 1

    async def test_project_manual_save_persists_in_place_default_project_change(self):
        async with real_project_manager() as fixture:
            manager = fixture.manager

            default_config_id = manager.project_state_backend.defaultProjectConfigId
            assert default_config_id is not None
            default_config_id = ID(default_config_id)

            await manager.create_project_config(previewImgColor="#ffffff")

            project_config_ids = set(
                manager.project_state_backend.projectConfigs.keys()
            )
            created_ids = project_config_ids - {default_config_id}
            assert len(created_ids) == 1
            created_config_id = next(iter(created_ids))

            with (
                patch.object(
                    fixture.dbe,
                    "write_project",
                    wraps=fixture.dbe.write_project,
                ) as write_project,
                patch.object(
                    fixture.artifacts,
                    "save",
                    wraps=fixture.artifacts.save,
                ) as save_artifacts,
            ):
                # Persist the config creation.
                manager.perform_manual_save()
                # No state changes, so this should not write again.
                manager.perform_manual_save()
                # This mutation is in-place and does not create a new history entry.
                await manager.set_as_default_project(created_config_id)
                # The in-place mutation must still be persisted.
                manager.perform_manual_save()
                # No additional changes after persistence.
                manager.perform_manual_save()

            assert write_project.call_count == 2
            assert save_artifacts.call_count == 2

            on_disk_after = fixture.dbe.read_project()
            assert on_disk_after.defaultProjectConfigId == created_config_id


@pytest.mark.asyncio
class TestSaveWorkerBehavior:
    async def test_build_save_work_item_defers_payload_materialization(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            manager.settings_file.settings.backend.autosave = False
            manager.add_new_history_entry(trigger_autosave=False)
            revision = manager.history.revision

            work_item = manager._build_save_work_item(revision)

            assert work_item.revision == revision
            assert work_item.payload is None
            assert work_item.source_backend is manager.project_state_backend
            assert (
                work_item.default_project_config_id
                == manager.project_state_backend.defaultProjectConfigId
            )

    async def test_autosave_resolves_payload_in_save_worker_thread(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            manager.settings_file.settings.backend.autosave = False
            manager.add_new_history_entry(trigger_autosave=False)

            resolve_threads: list[str] = []
            original_resolve = manager._resolve_save_work_item_payload

            def record_resolve(work_item):
                resolve_threads.append(threading.current_thread().name)
                original_resolve(work_item)

            with patch.object(
                manager,
                "_resolve_save_work_item_payload",
                side_effect=record_resolve,
            ):
                await manager.autosave()

            assert resolve_threads
            main_thread_name = threading.current_thread().name
            assert all(
                thread_name != main_thread_name for thread_name in resolve_threads
            )
            assert any(
                thread_name.startswith(f"{type(manager).__name__}-save-worker")
                for thread_name in resolve_threads
            )

    async def test_autosave_save_worker_does_not_block_manager_queue(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            manager.settings_file.settings.backend.autosave = False
            manager.add_new_history_entry(trigger_autosave=False)

            started = threading.Event()
            release = threading.Event()
            original_persist = manager._persist_save_work_item

            def delayed_persist(work_item):
                started.set()
                if not release.wait(timeout=1.0):
                    raise TimeoutError("Timed out waiting to release save worker.")
                original_persist(work_item)

            with patch.object(
                manager,
                "_persist_save_work_item",
                side_effect=delayed_persist,
            ):
                autosave_task = asyncio.create_task(manager.autosave())
                started_ok = await asyncio.to_thread(started.wait, 5.0)
                assert started_ok

                # Queue processing must continue while autosave save I/O is in flight.
                await asyncio.wait_for(manager._enqueue(asyncio.sleep(0)), timeout=1.0)

                release.set()
                await autosave_task

    async def test_autosave_coalesces_pending_revisions_to_latest(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            manager.settings_file.settings.backend.autosave = False
            manager.add_new_history_entry(trigger_autosave=False)
            first_revision = manager.history.revision

            started = threading.Event()
            release = threading.Event()
            persisted_revisions: list[int] = []
            original_persist = manager._persist_save_work_item

            def delayed_persist(work_item):
                persisted_revisions.append(work_item.revision)
                if len(persisted_revisions) == 1:
                    started.set()
                    if not release.wait(timeout=1.0):
                        raise TimeoutError("Timed out waiting to release save worker.")
                original_persist(work_item)

            with patch.object(
                manager,
                "_persist_save_work_item",
                side_effect=delayed_persist,
            ):
                autosave_first = asyncio.create_task(manager.autosave())
                started_ok = await asyncio.to_thread(started.wait, 5.0)
                assert started_ok

                manager.add_new_history_entry(trigger_autosave=False)
                second_revision = manager.history.revision
                autosave_second = asyncio.create_task(manager.autosave())

                manager.add_new_history_entry(trigger_autosave=False)
                third_revision = manager.history.revision
                autosave_third = asyncio.create_task(manager.autosave())

                release.set()
                await asyncio.gather(autosave_first, autosave_second, autosave_third)

            # The worker must persist the first in-flight revision, then only the
            # latest pending revision while skipping superseded pending revisions.
            assert len(persisted_revisions) == 2
            assert persisted_revisions[0] >= first_revision
            assert persisted_revisions[1] == third_revision
            assert second_revision not in persisted_revisions

    async def test_manual_save_surfaces_worker_errors_and_supports_retry(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            manager.settings_file.settings.backend.autosave = False
            manager.add_new_history_entry(trigger_autosave=False)

            with patch.object(
                manager,
                "_persist_save_work_item",
                side_effect=RuntimeError("save failed"),
            ):
                with pytest.raises(RuntimeError, match="save failed"):
                    manager.perform_manual_save()

            # A subsequent manual save should retry the same revision and succeed.
            manager.perform_manual_save()
