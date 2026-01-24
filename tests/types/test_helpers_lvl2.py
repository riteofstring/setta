import unittest

from setta.types.code_obj_impls import (
    CodeObjType,
    CodeParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    NestedParamCodeObjImpl,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import (
    add_kwarg,
    apply_top_level_section_layout_snapshot,
    change_param_impl,
    compute_smart_top_level_section_position,
    create_top_level_section,
    delete_sections,
    get_curr_top_level_param_ids,
)
from setta.types.project_config import (
    Position,
    ProjectConfig,
    TopLevelSectionLayout,
    ViewportBounds,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import BaseDictSectionImpl, SectionSize, SectionType


class AddKwargTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_add_kwarg_initializes_dict_section_top_level_param(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )

        add_kwarg(self.settings, self.project_state, section_id)

        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            BaseDictSectionImpl,
        )
        self.assertIsNotNone(section_impl.topLevelParamId)
        assert section_impl.topLevelParamId is not None

        top_level_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            section_impl.topLevelParamId,
            NestedParamCodeObjImpl,
        )
        self.assertIsInstance(top_level_impl, NestedParamCodeObjImpl)
        self.assertEqual(len(top_level_impl.children), 1)

        kwarg_id = top_level_impl.children[0]
        kwarg_core = self.project_state.codeObjs[kwarg_id]
        kwarg_variant_id = kwarg_core.defaultVariant
        self.assertIsNotNone(kwarg_variant_id)
        assert kwarg_variant_id is not None

        kwarg_impl_id = self.project_state.codeObjVariants[kwarg_variant_id].impl
        kwarg_impl = self.project_state.codeObjImpls[kwarg_impl_id]
        self.assertIsInstance(kwarg_impl, CodeParamCodeObjImpl)

        top_level_param_ids = get_curr_top_level_param_ids(
            self.project_state, section_id
        )
        self.assertEqual(top_level_param_ids, [kwarg_id])


class DeleteSectionsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_delete_sections_cleans_section_variant_map(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        self.assertIn(section_id, self.project_state.projectConfig.sectionVariantMap)

        delete_sections(self.project_state, [section_id])

        self.assertNotIn(section_id, self.project_state.sections)
        self.assertNotIn(section_id, self.project_state.projectConfig.sectionVariantMap)
        self.project_state.validate_code_file_bindings()


class ChangeParamImplTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_change_param_impl_preserves_kwarg_editability(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )

        add_kwarg(self.settings, self.project_state, section_id)

        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            BaseDictSectionImpl,
        )
        self.assertIsNotNone(section_impl.topLevelParamId)
        assert section_impl.topLevelParamId is not None

        top_level_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            section_impl.topLevelParamId,
            NestedParamCodeObjImpl,
        )
        self.assertEqual(len(top_level_impl.children), 1)
        kwarg_id = top_level_impl.children[0]

        kwarg_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            kwarg_id,
            CodeParamCodeObjImpl,
        )
        self.assertTrue(kwarg_impl.coreNameEditable)
        old_core_name_type = kwarg_impl.coreNameType
        old_passing_style = kwarg_impl.passingStyle

        change_param_impl(
            self.settings,
            self.project_state,
            section_id,
            kwarg_id,
            CodeObjType.DropdownParam.name,
        )

        updated_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            kwarg_id,
            DropdownParamCodeObjImpl,
        )
        self.assertTrue(updated_impl.coreNameEditable)
        self.assertEqual(updated_impl.coreNameType, old_core_name_type)
        self.assertEqual(updated_impl.passingStyle, old_passing_style)


class SmartLayoutTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_smart_layout_places_inside_viewport(self) -> None:
        viewport_bounds = ViewportBounds(x=0, y=0, w=300, h=240)
        overrides = {"size": SectionSize(width=100, height=80)}

        position, pan_to = compute_smart_top_level_section_position(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            overrides,
            None,
            viewport_bounds,
        )

        self.assertAlmostEqual(position.x, 24.0)
        self.assertAlmostEqual(position.y, 24.0)
        self.assertIsNone(pan_to)

    def test_smart_layout_positions_right_and_pans_when_viewport_too_narrow(
        self,
    ) -> None:
        viewport_bounds = ViewportBounds(x=0, y=0, w=100, h=240)
        overrides = {"size": SectionSize(width=160, height=100)}

        position, pan_to = compute_smart_top_level_section_position(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            overrides,
            None,
            viewport_bounds,
        )

        self.assertAlmostEqual(position.x, 124.0)
        self.assertAlmostEqual(position.y, 24.0)
        self.assertIsNotNone(pan_to)
        assert pan_to is not None
        self.assertAlmostEqual(pan_to.x, position.x + 80.0)
        self.assertAlmostEqual(pan_to.y, position.y + 50.0)

    def test_smart_layout_uses_layout_snapshot_for_collisions(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        existing_layout = self.project_state.projectConfig.topLevelSections[section_id]
        existing_layout.w = 200
        existing_layout.h = 200
        viewport_bounds = ViewportBounds(x=0, y=0, w=148, h=148)
        overrides = {"size": SectionSize(width=100, height=100)}
        layout_snapshot = {
            section_id: TopLevelSectionLayout(x=300, y=0, w=200, h=200)
        }
        apply_top_level_section_layout_snapshot(self.project_state, layout_snapshot)

        position, pan_to = compute_smart_top_level_section_position(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            overrides,
            None,
            viewport_bounds,
        )

        self.assertAlmostEqual(position.x, 24.0)
        self.assertAlmostEqual(position.y, 24.0)
        self.assertIsNone(pan_to)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
