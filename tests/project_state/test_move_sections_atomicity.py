import pytest

from setta.project_state.project_manager_types import MoveSectionsRequest
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.project_config import Position
from setta.types.section_impls import SectionType
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


@pytest.mark.asyncio
async def test_move_sections_to_pane_missing_position_is_atomic() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        first_section_id = next(iter(project_state.projectConfig.topLevelSections.keys()))
        second_section_id = create_top_level_section(
            manager.settings_file.settings,
            project_state,
            SectionType.Code,
            Position(x=920.0, y=180.0),
        )
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        before_state = manager.get_single_config_state(project_config_id)
        first_layout_before = before_state.projectConfig.topLevelSections[
            first_section_id
        ].model_copy(deep=True)
        second_layout_before = before_state.projectConfig.topLevelSections[
            second_section_id
        ].model_copy(deep=True)
        history_revision_before = manager.history.revision

        # Batched pane moves must be all-or-nothing: missing position metadata for
        # any section should fail without moving earlier sections or adding history.
        with pytest.raises(KeyError, match="Missing position when moving section"):
            await manager.move_sections(
                MoveSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[first_section_id, second_section_id],
                    newParentId=None,
                    newIndex=None,
                    positionsById={
                        first_section_id: Position(x=111.0, y=222.0),
                    },
                )
            )

        after_state = manager.get_single_config_state(project_config_id)
        first_layout_after = after_state.projectConfig.topLevelSections[first_section_id]
        second_layout_after = after_state.projectConfig.topLevelSections[
            second_section_id
        ]
        assert first_layout_after.model_dump() == first_layout_before.model_dump()
        assert second_layout_after.model_dump() == second_layout_before.model_dump()
        assert manager.history.revision == history_revision_before
