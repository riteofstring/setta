import pytest

from setta.project_state.project_manager_types import ToggleViewModeTabRequest
from tests.utils.manager_fixture import real_project_manager


@pytest.mark.asyncio
class TestProjectConfigViewModes:
    async def test_create_project_config_starts_with_single_view_mode(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            existing_ids = set(manager.project_state_backend.projectConfigs.keys())

            await manager.create_project_config("bg-blue-500/60 dark:bg-blue-600/30")

            new_ids = set(manager.project_state_backend.projectConfigs.keys())
            new_ids = new_ids - existing_ids
            assert len(new_ids) == 1
            new_id = next(iter(new_ids))

            project_config = manager.project_state_backend.projectConfigs[new_id]
            assert len(project_config.viewModes) == 1

            project_state = manager.get_single_config_state(new_id)
            assert len(project_state.projectConfig.viewModes) == 1

    async def test_toggle_view_mode_tab_updates_flag(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = next(
                iter(manager.project_state_backend.projectConfigs.keys())
            )
            project_state = manager.get_single_config_state(project_config_id)
            view_mode_id = next(iter(project_state.projectConfig.viewModes.keys()))
            view_mode = project_state.projectConfig.viewModes[view_mode_id]
            assert view_mode.isTab is False

            await manager.toggle_view_mode_tab(
                ToggleViewModeTabRequest(
                    projectConfigId=project_config_id,
                    viewModeId=view_mode_id,
                )
            )

            updated_state = manager.get_single_config_state(project_config_id)
            updated_view_mode = updated_state.projectConfig.viewModes[view_mode_id]
            assert updated_view_mode.isTab is True
