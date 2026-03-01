import pytest

import setta.project_state.base_project_manager as base_project_manager_module
from setta.project_state.project_manager_types import (
    GetLatestProjectStateRequest,
    GetLatestProjectStateSummaryRequest,
    RedoRequest,
    UndoRequest,
)
from setta.types.helpers_lvl3 import build_project_state_summary
from setta.types.project_config import ProjectConfig
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


@pytest.mark.asyncio
async def test_get_single_config_state_reuses_slice_within_same_revision(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        convert_calls = 0
        original_convert = base_project_manager_module.convert_backend_to_single_config

        def record_convert(*args, **kwargs):
            nonlocal convert_calls
            convert_calls += 1
            return original_convert(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )

        # Repeated reads in one history revision should reuse the cached slice.
        state_first = manager.get_single_config_state(project_config_id)
        state_second = manager.get_single_config_state(project_config_id)
        assert convert_calls == 1
        assert state_first is state_second


@pytest.mark.asyncio
async def test_get_single_config_state_cache_invalidates_on_history_revision(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        convert_calls = 0
        original_convert = base_project_manager_module.convert_backend_to_single_config

        def record_convert(*args, **kwargs):
            nonlocal convert_calls
            convert_calls += 1
            return original_convert(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )

        state_before_revision = manager.get_single_config_state(project_config_id)

        # Any history revision bump must invalidate the cache.
        manager.add_new_history_entry(trigger_autosave=False)
        state_after_revision = manager.get_single_config_state(project_config_id)

        assert convert_calls == 2
        assert state_after_revision is not state_before_revision


@pytest.mark.asyncio
async def test_get_single_config_state_cache_isolated_per_project_config(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)

        primary_id = project_state.projectConfig.id
        existing_ids = set(manager.project_state_backend.projectConfigs.keys())
        await manager.create_project_config(previewImgColor="#ffffff")
        all_ids = set(manager.project_state_backend.projectConfigs.keys())
        created_ids = all_ids - existing_ids
        assert len(created_ids) == 1
        secondary_id = next(iter(created_ids))

        convert_calls = 0
        original_convert = base_project_manager_module.convert_backend_to_single_config

        def record_convert(*args, **kwargs):
            nonlocal convert_calls
            convert_calls += 1
            return original_convert(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )

        # Each config should populate its cache entry once and reuse it on repeat reads.
        primary_first = manager.get_single_config_state(primary_id)
        secondary_first = manager.get_single_config_state(secondary_id)
        primary_second = manager.get_single_config_state(primary_id)
        secondary_second = manager.get_single_config_state(secondary_id)

        assert convert_calls == 2
        assert primary_first is primary_second
        assert secondary_first is secondary_second
        assert primary_first is not secondary_first


@pytest.mark.asyncio
async def test_get_single_config_state_cache_invalidates_on_undo_and_redo(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        convert_calls = 0
        original_convert = base_project_manager_module.convert_backend_to_single_config

        def record_convert(*args, **kwargs):
            nonlocal convert_calls
            convert_calls += 1
            return original_convert(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )

        # Prime cache, then move history and ensure undo/redo force fresh slices.
        state_before_undo = manager.get_single_config_state(project_config_id)
        manager.add_new_history_entry(trigger_autosave=False)
        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        convert_calls_before_undo_read = convert_calls
        state_after_undo = manager.get_single_config_state(project_config_id)
        convert_calls_after_undo_read = convert_calls
        state_after_undo_repeat = manager.get_single_config_state(project_config_id)
        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        convert_calls_before_redo_read = convert_calls
        state_after_redo = manager.get_single_config_state(project_config_id)
        convert_calls_after_redo_read = convert_calls
        state_after_redo_repeat = manager.get_single_config_state(project_config_id)

        assert convert_calls_after_undo_read == convert_calls_before_undo_read + 1
        assert convert_calls_after_redo_read == convert_calls_before_redo_read + 1
        assert convert_calls == convert_calls_after_redo_read
        assert state_after_undo is not state_before_undo
        assert state_after_redo is not state_after_undo
        assert state_after_undo_repeat is state_after_undo
        assert state_after_redo_repeat is state_after_redo


@pytest.mark.asyncio
async def test_undo_redo_converts_only_scoped_navigation_project_configs(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        primary_id = project_state.projectConfig.id

        existing_ids = set(manager.project_state_backend.projectConfigs.keys())
        await manager.create_project_config(previewImgColor="#ffffff")
        created_ids = set(manager.project_state_backend.projectConfigs.keys()) - existing_ids
        assert len(created_ids) == 1
        secondary_id = next(iter(created_ids))

        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=primary_id,
            project_config_only=True,
        )
        manager.project_state_backend.projectConfigs[primary_id].name = (
            "scoped-navigation-primary"
        )

        converted_project_config_ids: list[str] = []
        original_convert = base_project_manager_module.convert_backend_to_single_config

        def record_convert(*args, **kwargs):
            converted_project_config_ids.append(str(args[1]))
            return original_convert(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )

        await manager.undo(UndoRequest(projectConfigId=primary_id, steps=1))
        assert set(converted_project_config_ids) == {str(primary_id)}
        assert str(secondary_id) not in converted_project_config_ids

        converted_project_config_ids.clear()
        await manager.redo(RedoRequest(projectConfigId=primary_id, steps=1))
        assert set(converted_project_config_ids) == {str(primary_id)}
        assert str(secondary_id) not in converted_project_config_ids


@pytest.mark.asyncio
async def test_undo_redo_scope_falls_back_to_all_configs_when_unknown(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        primary_id = project_state.projectConfig.id

        existing_ids = set(manager.project_state_backend.projectConfigs.keys())
        await manager.create_project_config(previewImgColor="#ffffff")
        created_ids = set(manager.project_state_backend.projectConfigs.keys()) - existing_ids
        assert len(created_ids) == 1
        all_project_config_ids = set(manager.project_state_backend.projectConfigs.keys())

        manager.history.add_current_copy()
        manager.project_state_backend.projectConfigs[primary_id].name = (
            "unknown-navigation-scope"
        )

        converted_project_config_ids: list[str] = []
        original_convert = base_project_manager_module.convert_backend_to_single_config

        def record_convert(*args, **kwargs):
            converted_project_config_ids.append(str(args[1]))
            return original_convert(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )

        await manager.undo(UndoRequest(projectConfigId=primary_id, steps=1))
        assert set(converted_project_config_ids) == {
            str(project_config_id) for project_config_id in all_project_config_ids
        }

        converted_project_config_ids.clear()
        await manager.redo(RedoRequest(projectConfigId=primary_id, steps=1))
        assert set(converted_project_config_ids) == {
            str(project_config_id) for project_config_id in all_project_config_ids
        }


@pytest.mark.asyncio
async def test_multi_step_undo_redo_unions_project_config_scopes(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        primary_id = project_state.projectConfig.id

        existing_ids = set(manager.project_state_backend.projectConfigs.keys())
        await manager.create_project_config(previewImgColor="#ffffff")
        created_ids = set(manager.project_state_backend.projectConfigs.keys()) - existing_ids
        assert len(created_ids) == 1
        secondary_id = next(iter(created_ids))

        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=primary_id,
            project_config_only=True,
        )
        manager.project_state_backend.projectConfigs[primary_id].name = (
            "multi-step-primary"
        )
        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=secondary_id,
            project_config_only=True,
        )
        manager.project_state_backend.projectConfigs[secondary_id].name = (
            "multi-step-secondary"
        )

        converted_project_config_ids: list[str] = []
        original_convert = base_project_manager_module.convert_backend_to_single_config

        def record_convert(*args, **kwargs):
            converted_project_config_ids.append(str(args[1]))
            return original_convert(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )

        await manager.undo(UndoRequest(projectConfigId=primary_id, steps=2))
        assert set(converted_project_config_ids) == {str(primary_id), str(secondary_id)}

        converted_project_config_ids.clear()
        await manager.redo(RedoRequest(projectConfigId=primary_id, steps=2))
        assert set(converted_project_config_ids) == {str(primary_id), str(secondary_id)}


@pytest.mark.asyncio
async def test_get_latest_project_state_reuses_single_config_cache(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        convert_calls = 0
        original_convert = base_project_manager_module.convert_backend_to_single_config

        def record_convert(*args, **kwargs):
            nonlocal convert_calls
            convert_calls += 1
            return original_convert(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )
        request = GetLatestProjectStateRequest(projectConfigId=project_config_id)

        # Route-style repeated reads should hit the same cached single-config slice.
        first = await manager.get_latest_project_state(request)
        second = await manager.get_latest_project_state(request)

        assert convert_calls == 1
        assert first is second


@pytest.mark.asyncio
async def test_get_latest_project_state_summary_reuses_single_config_cache(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        convert_calls = 0
        original_convert = base_project_manager_module.convert_backend_to_single_config
        summary_build_calls = 0
        original_summary_builder = (
            base_project_manager_module.build_project_state_summary
        )

        def record_convert(*args, **kwargs):
            nonlocal convert_calls
            convert_calls += 1
            return original_convert(*args, **kwargs)

        def record_build_summary(*args, **kwargs):
            nonlocal summary_build_calls
            summary_build_calls += 1
            return original_summary_builder(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )
        monkeypatch.setattr(
            base_project_manager_module,
            "build_project_state_summary",
            record_build_summary,
        )
        request = GetLatestProjectStateSummaryRequest(projectConfigId=project_config_id)

        # Repeated summary reads should reuse the same cached single-config slice.
        first = await manager.get_latest_project_state_summary(request)
        second = await manager.get_latest_project_state_summary(request)

        assert convert_calls == 1
        assert summary_build_calls == 1
        assert first is second
        assert first == second


@pytest.mark.asyncio
async def test_get_latest_project_state_summary_matches_direct_summary_build() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id
        request = GetLatestProjectStateSummaryRequest(projectConfigId=project_config_id)

        route_summary = await manager.get_latest_project_state_summary(request)
        direct_summary = build_project_state_summary(
            base_project_manager_module.convert_backend_to_single_config(
                manager.project_state_backend,
                project_config_id,
            )
        )

        assert route_summary == direct_summary


@pytest.mark.asyncio
async def test_get_latest_project_state_summary_cache_invalidates_on_history_revision(
    monkeypatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        convert_calls = 0
        original_convert = base_project_manager_module.convert_backend_to_single_config
        summary_build_calls = 0
        original_summary_builder = (
            base_project_manager_module.build_project_state_summary
        )

        def record_convert(*args, **kwargs):
            nonlocal convert_calls
            convert_calls += 1
            return original_convert(*args, **kwargs)

        def record_build_summary(*args, **kwargs):
            nonlocal summary_build_calls
            summary_build_calls += 1
            return original_summary_builder(*args, **kwargs)

        monkeypatch.setattr(
            base_project_manager_module,
            "convert_backend_to_single_config",
            record_convert,
        )
        monkeypatch.setattr(
            base_project_manager_module,
            "build_project_state_summary",
            record_build_summary,
        )
        request = GetLatestProjectStateSummaryRequest(projectConfigId=project_config_id)

        await manager.get_latest_project_state_summary(request)
        manager.add_new_history_entry(trigger_autosave=False)
        await manager.get_latest_project_state_summary(request)
        await manager.get_latest_project_state_summary(request)

        assert convert_calls == 2
        assert summary_build_calls == 2


@pytest.mark.asyncio
async def test_get_single_config_state_cache_does_not_return_deleted_project_config() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)

        existing_ids = set(manager.project_state_backend.projectConfigs.keys())
        await manager.create_project_config(previewImgColor="#ffffff")
        all_ids = set(manager.project_state_backend.projectConfigs.keys())
        created_ids = all_ids - existing_ids
        assert len(created_ids) == 1
        created_id = next(iter(created_ids))

        # Prime the cache with the created config, then delete it.
        manager.get_single_config_state(created_id)
        await manager.delete_project_configs([created_id])

        with pytest.raises(KeyError):
            manager.get_single_config_state(created_id)


@pytest.mark.asyncio
async def test_watch_code_files_forwards_single_config_fast_path_for_disjoint_configs() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)

        # Add another config with disjoint section ids.
        await manager.create_project_config(previewImgColor="#ffffff")

        recorded_project_state = None
        original_watch_code_files = manager.code_files.watch_code_files

        def record_watch_code_files(*_args, **kwargs) -> None:
            nonlocal recorded_project_state
            recorded_project_state = kwargs.get("project_state")

        manager.code_files.watch_code_files = record_watch_code_files  # type: ignore[method-assign]
        try:
            manager.watch_code_files(project_state)
        finally:
            manager.code_files.watch_code_files = original_watch_code_files  # type: ignore[method-assign]

        assert recorded_project_state is project_state


@pytest.mark.asyncio
async def test_watch_code_files_falls_back_to_full_refresh_when_sections_are_shared() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)

        # Inject a second config that points at the same section ids.
        shared_config = ProjectConfig(
            name="shared-section-config",
            sectionVariantMap=dict(project_state.projectConfig.sectionVariantMap),
        )
        manager.project_state_backend.projectConfigs[shared_config.id] = shared_config

        recorded_project_state = project_state
        original_watch_code_files = manager.code_files.watch_code_files

        def record_watch_code_files(*_args, **kwargs) -> None:
            nonlocal recorded_project_state
            recorded_project_state = kwargs.get("project_state")

        manager.code_files.watch_code_files = record_watch_code_files  # type: ignore[method-assign]
        try:
            manager.watch_code_files(project_state)
        finally:
            manager.code_files.watch_code_files = original_watch_code_files  # type: ignore[method-assign]

        assert recorded_project_state is None
