import asyncio
from pathlib import Path
import threading
import types
from typing import Awaitable, Callable, cast
from unittest.mock import patch

import pytest
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import SetWatchCodeEnabledRequest
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseDictSectionImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_section_variant,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import ConfigLanguage, SectionType
from setta.utils.paths import normalize_workspace_path

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


def _build_json_source_project_state(
    manager: BaseProjectManager,
) -> tuple[ProjectStateSingleConfig, ID, ID, Path]:
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="save-copy-on-write-json-source")
    )
    section_id = create_top_level_section(
        manager.settings_file.settings,
        project_state,
        SectionType.Dict,
        Position(),
    )
    set_curr_effective_section_impl_value(
        project_state,
        section_id,
        BaseDictSectionImplArgsWithCallable(
            isJsonSource=True,
            jsonSourceKeys=[],
            configLanguage=ConfigLanguage.json,
        ),
    )
    section_variant = get_curr_section_variant(project_state, section_id)
    json_source_path = normalize_workspace_path(Path("save-copy-on-write.json"))
    section_variant.name = str(json_source_path)
    return project_state, section_id, section_variant.id, json_source_path


def _get_code_obj_value_by_name(
    backend: ProjectStateBackend,
    project_config_id: ID,
    section_id: ID,
    code_obj_name: str,
) -> str:
    project_state = convert_backend_to_single_config(backend, project_config_id)
    code_obj_id: ID | None = None
    for curr_code_obj_id, code_obj in project_state.codeObjs.items():
        if code_obj.name != code_obj_name:
            continue
        code_obj_id = curr_code_obj_id
        break
    if code_obj_id is None:
        raise KeyError(f"Missing code obj named {code_obj_name}")
    code_obj_impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state,
        section_id,
        code_obj_id,
        BaseChildlessCodeObjImpl,
    )
    return code_obj_impl.value


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

    async def test_project_save_payload_copy_on_write_preserves_live_json_source_values(
        self,
    ):
        async with real_project_manager() as fixture:
            manager = fixture.manager
            manager.settings_file.settings.backend.autosave = False
            project_state, section_id, section_variant_id, json_source_path = (
                _build_json_source_project_state(manager)
            )
            await manager.update(project_state, updateFileWatcher=True)
            await manager.finish_pending_operations(timeout=5.0)
            project_config_id = project_state.projectConfig.id

            processed = manager.json_source.process_json_object({"alpha": "keep-live"})
            await manager.load_json_sources(
                {json_source_path: processed},
                [(section_id, section_variant_id)],
            )
            await manager.finish_pending_operations(timeout=5.0)

            source_value_before = _get_code_obj_value_by_name(
                manager.project_state_backend,
                project_config_id,
                section_id,
                "alpha",
            )
            assert source_value_before != ""

            manager.add_new_history_entry(trigger_autosave=False)
            revision = manager.history.revision
            work_item = manager._build_save_work_item(revision)
            manager._resolve_save_work_item_payload(work_item)
            manager._persist_save_work_item(work_item)

            # Save sanitization must not mutate the live backend revision.
            source_value_after = _get_code_obj_value_by_name(
                manager.project_state_backend,
                project_config_id,
                section_id,
                "alpha",
            )
            assert source_value_after == source_value_before

            # On-disk payload should still be sanitized for json-source sections.
            on_disk_value = _get_code_obj_value_by_name(
                fixture.dbe.read_project(),
                project_config_id,
                section_id,
                "alpha",
            )
            assert on_disk_value == ""

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

    async def test_autosave_does_not_persist_mid_handler_intermediate_state(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            manager.settings_file.settings.backend.autosave = False

            default_config_id = manager.project_state_backend.defaultProjectConfigId
            assert default_config_id is not None
            default_config_id = ID(default_config_id)
            initial_watch_code_enabled = manager.project_state_backend.projectConfigs[
                default_config_id
            ].watchCodeEnabled
            intermediate_watch_code_enabled = not initial_watch_code_enabled
            mutation_started = asyncio.Event()
            release_mutation = asyncio.Event()

            async def two_phase_in_place_mutation() -> None:
                manager.add_new_history_entry(
                    trigger_autosave=False,
                    project_config_id=default_config_id,
                    project_config_only=True,
                )
                project_config = manager.project_state_backend.projectConfigs[
                    default_config_id
                ]
                project_config.watchCodeEnabled = intermediate_watch_code_enabled
                mutation_started.set()
                await release_mutation.wait()
                # Final state in this history revision differs from the intermediate
                # value and must be what autosave persists.
                project_config.watchCodeEnabled = initial_watch_code_enabled

            mutation_task = asyncio.create_task(manager._enqueue(two_phase_in_place_mutation()))
            await asyncio.wait_for(mutation_started.wait(), timeout=5.0)

            autosave_task = asyncio.create_task(manager.autosave())
            await asyncio.sleep(0)
            assert not autosave_task.done()
            release_mutation.set()
            await mutation_task
            await autosave_task

            assert (
                manager.project_state_backend.projectConfigs[
                    default_config_id
                ].watchCodeEnabled
                == initial_watch_code_enabled
            )
            on_disk = fixture.dbe.read_settings_project()
            assert (
                on_disk.projectConfig.watchCodeEnabled == initial_watch_code_enabled
            )

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
