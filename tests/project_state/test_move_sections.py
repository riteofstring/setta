import unittest

from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_child_sections,
    create_top_level_section,
    get_curr_section_children_ids,
    move_section_to_pane,
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

    def test_move_sections_rejects_selected_parent(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="move-sections-selected-parent")
        )
        parent_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=0, y=0),
        )
        project_state.validate_parent_section_map()

        with self.assertRaisesRegex(
            ValueError, "Cannot reparent into a selected section."
        ):
            move_sections_to_parent_section(
                project_state,
                parent_id,
                [parent_id],
                0,
            )

    def test_move_sections_rejects_descendant_parent(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="move-sections-descendant-parent")
        )
        parent_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=0, y=0),
        )
        [child_group_id] = create_child_sections(
            settings,
            project_state,
            parent_id,
            SectionType.Group,
            1,
            0,
        )
        project_state.validate_parent_section_map()

        with self.assertRaisesRegex(
            ValueError, "Cannot reparent into a descendant of selection."
        ):
            move_sections_to_parent_section(
                project_state,
                child_group_id,
                [parent_id],
                0,
            )

    def test_move_sections_rejects_index_past_range(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="move-sections-index-range")
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
            3,
            0,
        )
        project_state.validate_parent_section_map()
        original_children = get_curr_section_children_ids(project_state, parent_id)

        with self.assertRaisesRegex(
            ValueError, "New index exceeds available sibling range."
        ):
            move_sections_to_parent_section(
                project_state,
                parent_id,
                [child_ids[1]],
                3,
            )
        self.assertEqual(
            get_curr_section_children_ids(project_state, parent_id),
            original_children,
        )
        project_state.validate_parent_section_map()

    def test_move_sections_from_multiple_parents_updates_map(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="move-sections-multi-parent")
        )
        parent_a = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=0, y=0),
        )
        parent_b = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=10, y=10),
        )
        parent_c = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=20, y=20),
        )
        child_a_ids = create_child_sections(
            settings,
            project_state,
            parent_a,
            SectionType.TextBlock,
            2,
            0,
        )
        child_b_ids = create_child_sections(
            settings,
            project_state,
            parent_b,
            SectionType.TextBlock,
            2,
            0,
        )
        [child_c] = create_child_sections(
            settings,
            project_state,
            parent_c,
            SectionType.TextBlock,
            1,
            0,
        )
        project_state.validate_parent_section_map()

        move_sections_to_parent_section(
            project_state,
            parent_c,
            [child_a_ids[0], child_b_ids[1]],
            0,
        )

        self.assertEqual(
            get_curr_section_children_ids(project_state, parent_a),
            [child_a_ids[1]],
        )
        self.assertEqual(
            get_curr_section_children_ids(project_state, parent_b),
            [child_b_ids[0]],
        )
        self.assertEqual(
            get_curr_section_children_ids(project_state, parent_c),
            [child_a_ids[0], child_b_ids[1], child_c],
        )
        project_state.validate_parent_section_map()
        self.assertEqual(project_state.parentSectionMap[child_a_ids[0]], parent_c)
        self.assertEqual(project_state.parentSectionMap[child_b_ids[1]], parent_c)

    def test_move_sections_rejects_missing_parent_entry(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="move-sections-missing-parent")
        )
        parent_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=0, y=0),
        )
        [child_id] = create_child_sections(
            settings,
            project_state,
            parent_id,
            SectionType.TextBlock,
            1,
            0,
        )
        project_state.validate_parent_section_map()

        with self.assertRaisesRegex(
            KeyError, "Missing parentSectionMap entry"
        ):
            move_sections_to_parent_section(
                project_state,
                "missing-parent",
                [child_id],
                0,
            )

    def test_move_section_to_pane_sets_z_index_after_existing(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="move-sections-pane-z-index")
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
        project_state.projectConfig.topLevelSections[top_level_a].zIndex = 3
        project_state.projectConfig.topLevelSections[top_level_b].zIndex = 7
        [child_id] = create_child_sections(
            settings,
            project_state,
            parent_id,
            SectionType.TextBlock,
            1,
            0,
        )
        project_state.validate_parent_section_map()

        move_section_to_pane(project_state, child_id, Position(x=5, y=5))

        layout = project_state.projectConfig.topLevelSections[child_id]
        self.assertEqual(layout.zIndex, 8)

    def test_move_section_to_pane_increments_z_index_for_multiple_moves(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="move-sections-pane-z-index-multi")
        )
        parent_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=0, y=0),
        )
        top_level = create_top_level_section(
            settings,
            project_state,
            SectionType.TextBlock,
            Position(x=10, y=10),
        )
        project_state.projectConfig.topLevelSections[top_level].zIndex = 10
        child_ids = create_child_sections(
            settings,
            project_state,
            parent_id,
            SectionType.TextBlock,
            2,
            0,
        )
        project_state.validate_parent_section_map()

        move_section_to_pane(project_state, child_ids[0], Position(x=5, y=5))
        move_section_to_pane(project_state, child_ids[1], Position(x=15, y=15))

        layout_first = project_state.projectConfig.topLevelSections[child_ids[0]]
        layout_second = project_state.projectConfig.topLevelSections[child_ids[1]]
        self.assertEqual(layout_first.zIndex, 11)
        self.assertEqual(layout_second.zIndex, 12)


if __name__ == "__main__":
    unittest.main()
