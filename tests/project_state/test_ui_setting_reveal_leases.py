import pytest

from setta.app.spec_store import default_app_spec_path
from setta.project_state.project_manager_types import (
    SetShowParamDisplayNamesRequest,
    SetWatchCodeEnabledRequest,
    SetWatchCodeInputsRequest,
)
from setta.types.app_definition import AppDefinition
from setta.types.id import ID
from setta.types.project_config import (
    ProjectCodegenLanguage,
    ProjectCodegenPluginTarget,
    ProjectCodegenPythonTarget,
)
from tests.utils.manager_fixture import real_project_manager


@pytest.mark.asyncio
async def test_compare_and_set_python_codegen_enabled_same_value_is_noop_preserves_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        project_state = manager.get_single_config_state(project_config_id)
        project_state.projectConfig.codegenTargets = [
            ProjectCodegenPythonTarget(genCodePrefix="# keep python target first"),
            ProjectCodegenPluginTarget(language="plugin.codegen.target"),
        ]
        history_len_before = len(manager.history._history)
        update_calls = 0
        original_update = manager.update_and_broadcast_project_state

        async def _record_update(*args, **kwargs) -> None:
            nonlocal update_calls
            update_calls += 1
            await original_update(*args, **kwargs)

        monkeypatch.setattr(
            manager, "update_and_broadcast_project_state", _record_update
        )

        # Same-value CAS must not create history or trigger persistence side effects.
        old_value, new_value = await manager.compare_and_set_python_codegen_enabled(
            project_config_id,
            True,
        )

        assert old_value is True
        assert new_value is True
        assert len(manager.history._history) == history_len_before
        assert update_calls == 0
        updated_targets = manager.get_single_config_state(
            project_config_id
        ).projectConfig.codegenTargets
        assert isinstance(updated_targets[0], ProjectCodegenPythonTarget)
        assert isinstance(updated_targets[1], ProjectCodegenPluginTarget)
        assert [target.language for target in updated_targets] == [
            ProjectCodegenLanguage.python,
            "plugin.codegen.target",
        ]


@pytest.mark.asyncio
async def test_project_manager_no_longer_exposes_backend_reveal_lease_helpers() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        assert not hasattr(type(manager), "set_active_ids_for_ui_setting_reveal")
        assert not hasattr(type(manager), "rollback_active_ids_for_ui_setting_reveal")


@pytest.mark.asyncio
async def test_compare_and_set_show_param_display_names_same_value_is_side_effect_free(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        project_state = manager.get_single_config_state(project_config_id)
        old_value = project_state.projectConfig.showParamDisplayNames
        update_calls = 0
        history_len_before = len(manager.history._history)
        original_update = manager._update_and_broadcast_project_state_no_name_validation

        async def _record_update(*args, **kwargs) -> None:
            nonlocal update_calls
            update_calls += 1
            await original_update(*args, **kwargs)

        monkeypatch.setattr(
            manager,
            "_update_and_broadcast_project_state_no_name_validation",
            _record_update,
        )

        # Same-value writes must not trigger UI broadcasts or persistence churn.
        (
            previous_value,
            next_value,
        ) = await manager.compare_and_set_show_param_display_names(
            SetShowParamDisplayNamesRequest(
                projectConfigId=project_config_id,
                showParamDisplayNames=old_value,
            )
        )

        assert previous_value == old_value
        assert next_value == old_value
        assert update_calls == 0
        assert len(manager.history._history) == history_len_before


@pytest.mark.asyncio
async def test_compare_and_set_watch_code_noops_are_side_effect_free(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        project_state = manager.get_single_config_state(project_config_id)
        project_state.projectConfig.watchCodeEnabled = True
        project_state.projectConfig.watchCodeFolders = []
        project_state.projectConfig.watchCodeFiles = []
        update_calls = 0
        baseline_enable_calls = 0
        baseline_inputs_calls = 0
        history_len_before = len(manager.history._history)
        original_update = manager.update_and_broadcast_project_state
        original_baseline_on_enable = manager.watch_code_manager.baseline_on_enable
        original_baseline_for_new_inputs = (
            manager.watch_code_manager.baseline_for_new_inputs
        )

        async def _record_update(*args, **kwargs) -> None:
            nonlocal update_calls
            update_calls += 1
            await original_update(*args, **kwargs)

        def _record_baseline_on_enable(*args, **kwargs) -> None:
            nonlocal baseline_enable_calls
            baseline_enable_calls += 1
            original_baseline_on_enable(*args, **kwargs)

        def _record_baseline_for_new_inputs(*args, **kwargs) -> None:
            nonlocal baseline_inputs_calls
            baseline_inputs_calls += 1
            original_baseline_for_new_inputs(*args, **kwargs)

        monkeypatch.setattr(
            manager, "update_and_broadcast_project_state", _record_update
        )
        monkeypatch.setattr(
            manager.watch_code_manager,
            "baseline_on_enable",
            _record_baseline_on_enable,
        )
        monkeypatch.setattr(
            manager.watch_code_manager,
            "baseline_for_new_inputs",
            _record_baseline_for_new_inputs,
        )

        # No-op CAS operations should not broadcast or trigger watch-code baselining.
        enabled_old, enabled_new = await manager.compare_and_set_watch_code_enabled(
            SetWatchCodeEnabledRequest(projectConfigId=project_config_id, enabled=True)
        )
        folders_old, folders_new = await manager.compare_and_set_watch_code_folders(
            SetWatchCodeInputsRequest(
                projectConfigId=project_config_id,
                watchCodeFolders=[],
                watchCodeFiles=[],
            )
        )
        files_old, files_new = await manager.compare_and_set_watch_code_files(
            SetWatchCodeInputsRequest(
                projectConfigId=project_config_id,
                watchCodeFolders=[],
                watchCodeFiles=[],
            )
        )

        assert enabled_old is True
        assert enabled_new is True
        assert folders_old == []
        assert folders_new == []
        assert files_old == []
        assert files_new == []
        assert update_calls == 0
        assert baseline_enable_calls == 0
        assert baseline_inputs_calls == 0
        assert len(manager.history._history) == history_len_before


@pytest.mark.asyncio
async def test_compare_and_set_project_config_name_same_value_skips_broadcast_and_save(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        old_name = manager.project_state_backend.projectConfigs[project_config_id].name
        metadata_broadcast_calls = 0
        manual_save_calls = 0
        original_broadcast = manager.broadcast_all_project_metadata
        original_manual_save = manager.perform_manual_save

        async def _record_broadcast() -> None:
            nonlocal metadata_broadcast_calls
            metadata_broadcast_calls += 1
            await original_broadcast()

        def _record_manual_save() -> None:
            nonlocal manual_save_calls
            manual_save_calls += 1
            original_manual_save()

        monkeypatch.setattr(
            manager, "broadcast_all_project_metadata", _record_broadcast
        )
        monkeypatch.setattr(manager, "perform_manual_save", _record_manual_save)

        # Same-value project rename CAS must be a complete no-op.
        previous_name, next_name = await manager.compare_and_set_project_config_name(
            project_config_id,
            old_name,
        )

        assert previous_name == old_name
        assert next_name == old_name
        assert metadata_broadcast_calls == 0
        assert manual_save_calls == 0


@pytest.mark.asyncio
async def test_compare_and_set_project_config_name_changed_value_broadcasts_and_saves(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        old_name = manager.project_state_backend.projectConfigs[project_config_id].name
        new_name = f"{old_name}_renamed"
        metadata_broadcast_calls = 0
        manual_save_calls = 0
        original_broadcast = manager.broadcast_all_project_metadata
        original_manual_save = manager.perform_manual_save

        async def _record_broadcast() -> None:
            nonlocal metadata_broadcast_calls
            metadata_broadcast_calls += 1
            await original_broadcast()

        def _record_manual_save() -> None:
            nonlocal manual_save_calls
            manual_save_calls += 1
            original_manual_save()

        monkeypatch.setattr(
            manager, "broadcast_all_project_metadata", _record_broadcast
        )
        monkeypatch.setattr(manager, "perform_manual_save", _record_manual_save)

        previous_name, next_name = await manager.compare_and_set_project_config_name(
            project_config_id,
            new_name,
            expected_old_value=old_name,
        )

        assert previous_name == old_name
        assert next_name == new_name
        assert metadata_broadcast_calls == 1
        assert manual_save_calls == 1
        persisted_project_state = fixture.dbe.read_project()
        assert (
            persisted_project_state.projectConfigs[project_config_id].name == new_name
        )


@pytest.mark.asyncio
async def test_compare_and_set_app_definition_metadata_noops_do_not_materialize_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        default_definition = AppDefinition()
        default_spec_path = default_app_spec_path()
        assert manager.project_state_backend.appDefinition is None
        assert not (manager.dbe.path / default_spec_path).exists()
        commit_calls = 0
        history_len_before = len(manager.history._history)
        original_commit = manager._commit_app_definition_metadata_update

        async def _record_commit(*args, **kwargs) -> None:
            nonlocal commit_calls
            commit_calls += 1
            await original_commit(*args, **kwargs)

        monkeypatch.setattr(
            manager,
            "_commit_app_definition_metadata_update",
            _record_commit,
        )

        # Same-value app metadata writes must not materialize appDefinition or app spec files.
        (
            catalog_old,
            catalog_new,
        ) = await manager.compare_and_set_app_definition_catalog_id(
            catalog_id=default_definition.catalogId
        )
        (
            version_old,
            version_new,
        ) = await manager.compare_and_set_app_definition_spec_version(
            app_spec_version=default_definition.appSpecVersion
        )
        (
            spec_path_old,
            spec_path_new,
        ) = await manager.compare_and_set_app_definition_spec_path(
            app_spec_path=default_spec_path
        )
        theme_old, theme_new = await manager.compare_and_set_app_definition_theme_mode(
            theme_mode="auto"
        )

        assert catalog_old == default_definition.catalogId
        assert catalog_new == default_definition.catalogId
        assert version_old == default_definition.appSpecVersion
        assert version_new == default_definition.appSpecVersion
        assert spec_path_old == default_spec_path
        assert spec_path_new == default_spec_path
        assert theme_old == "auto"
        assert theme_new == "auto"
        assert commit_calls == 0
        assert len(manager.history._history) == history_len_before
        assert manager.project_state_backend.appDefinition is None
        assert not (manager.dbe.path / default_spec_path).exists()
