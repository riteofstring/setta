import pytest

from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    SetActiveIdsRequest,
)
from setta.types.id import ID
from setta.types.project_config import (
    ProjectCodegenLanguage,
    ProjectCodegenPluginTarget,
    ProjectCodegenPythonTarget,
)
from setta.types.section_impls import SectionType
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
async def test_set_active_ids_for_ui_setting_reveal_supersedes_stale_lease_without_rebroadcast(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        create_result = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Dict,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        section_id = create_result.sectionId
        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=project_config_id,
                activeIds=[],
            )
        )
        broadcast_calls = 0
        original_update = manager._update_and_broadcast_project_state_no_name_validation

        async def _record_update(*args, **kwargs) -> None:
            nonlocal broadcast_calls
            broadcast_calls += 1
            await original_update(*args, **kwargs)

        monkeypatch.setattr(
            manager,
            "_update_and_broadcast_project_state_no_name_validation",
            _record_update,
        )

        # A second lease acquisition for the same activeIds must supersede rollback ownership.
        first_lease_id = await manager.set_active_ids_for_ui_setting_reveal(
            project_config_id=project_config_id,
            active_ids=[section_id],
        )
        second_lease_id = await manager.set_active_ids_for_ui_setting_reveal(
            project_config_id=project_config_id,
            active_ids=[section_id],
        )

        assert first_lease_id != second_lease_id
        stale_rollback_applied = (
            await manager.rollback_active_ids_for_ui_setting_reveal(
                project_config_id=project_config_id,
                reveal_activation_lease_id=first_lease_id,
                rollback_active_ids=[],
            )
        )
        assert stale_rollback_applied is False
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == [section_id]
        assert broadcast_calls == 1
