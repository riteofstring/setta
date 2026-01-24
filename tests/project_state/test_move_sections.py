import unittest

from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_child_sections,
    create_top_level_section,
    get_curr_section_children_ids,
    move_sections_to_parent_section,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


class MoveSectionsTests(unittest.TestCase):
    def test_move_sections_within_parent_keeps_contiguous_block(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="move-sections-parent")
        )
        parent_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=0, y=0),
        )
        child_ids = create_child_sections(
            settings,
            project_state,
            parent_id,
            SectionType.TextBlock,
            4,
            0,
        )
        project_state.validate_parent_section_map()

        move_sections_to_parent_section(
            project_state,
            parent_id,
            [child_ids[0], child_ids[2]],
            1,
        )

        updated_children = get_curr_section_children_ids(project_state, parent_id)
        self.assertEqual(
            updated_children,
            [child_ids[1], child_ids[0], child_ids[2], child_ids[3]],
        )
        project_state.validate_parent_section_map()
        self.assertEqual(
            project_state.parentSectionMap[child_ids[0]],
            parent_id,
        )

    def test_move_sections_from_top_level_removes_layout_entries(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="move-sections-top-level")
        )
        parent_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=0, y=0),
        )
        top_level_a = create_top_level_section(
            settings,
            project_state,
            SectionType.TextBlock,
            Position(x=10, y=10),
        )
        top_level_b = create_top_level_section(
            settings,
            project_state,
            SectionType.TextBlock,
            Position(x=20, y=20),
        )
        project_state.validate_parent_section_map()

        move_sections_to_parent_section(
            project_state,
            parent_id,
            [top_level_a, top_level_b],
            0,
        )

        self.assertNotIn(top_level_a, project_state.projectConfig.topLevelSections)
        self.assertNotIn(top_level_b, project_state.projectConfig.topLevelSections)
        updated_children = get_curr_section_children_ids(project_state, parent_id)
        self.assertEqual(updated_children, [top_level_a, top_level_b])
        project_state.validate_parent_section_map()
        self.assertEqual(
            project_state.parentSectionMap[top_level_a],
            parent_id,
        )


if __name__ == "__main__":
    unittest.main()
