import unittest

from setta.types.code_obj_impls import NestedParamCodeObjImpl, TextParamCodeObjImpl
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_top_level_section,
    get_curr_top_level_param_ids,
    get_smart_top_level_section_position,
    _get_top_level_section_rects,
    _get_view_rect_bounds,
    _rect_overlaps_existing,
    _resolve_section_placement_size,
    _SECTION_PLACEMENT_PADDING,
    delete_sections,
)
from setta.types.project_config import Position, ProjectConfig, ViewRect
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import BaseDictSectionImpl, SectionType


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
        self.assertIsInstance(kwarg_impl, TextParamCodeObjImpl)

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


class SmartPlacementTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def _create_section_with_layout(
        self, position: Position, width: float, height: float
    ) -> str:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Callable,
            position,
        )
        layout = self.project_state.projectConfig.topLevelSections[section_id]
        layout.w = width
        layout.h = height
        return section_id

    def test_smart_placement_clamps_to_view_rect_when_empty(self) -> None:
        width, height = _resolve_section_placement_size(
            self.settings, SectionType.Callable, None
        )
        view_rect = ViewRect(
            x=0,
            y=0,
            width=width + _SECTION_PLACEMENT_PADDING * 4 + 100,
            height=height + _SECTION_PLACEMENT_PADDING * 4 + 100,
        )
        preferred = Position(x=10_000, y=-10_000)
        result = get_smart_top_level_section_position(
            self.settings,
            self.project_state,
            SectionType.Callable,
            None,
            preferred,
            view_rect,
        )

        bounds = _get_view_rect_bounds(view_rect, width, height)
        self.assertIsNotNone(bounds)
        assert bounds is not None
        min_x, min_y, max_x, max_y = bounds
        self.assertGreaterEqual(result.x, min_x)
        self.assertLessEqual(result.x, max_x)
        self.assertGreaterEqual(result.y, min_y)
        self.assertLessEqual(result.y, max_y)

    def test_smart_placement_prefers_view_rect_open_space(self) -> None:
        width, height = _resolve_section_placement_size(
            self.settings, SectionType.Callable, None
        )
        view_rect = ViewRect(
            x=0,
            y=0,
            width=width * 4 + 200,
            height=height * 3 + 200,
        )
        self._create_section_with_layout(Position(x=0, y=0), width, height)
        self._create_section_with_layout(
            Position(x=width + 40, y=0),
            width,
            height,
        )
        preferred = Position(x=10, y=10)
        result = get_smart_top_level_section_position(
            self.settings,
            self.project_state,
            SectionType.Callable,
            None,
            preferred,
            view_rect,
        )

        bounds = _get_view_rect_bounds(view_rect, width, height)
        self.assertIsNotNone(bounds)
        assert bounds is not None
        min_x, min_y, max_x, max_y = bounds
        self.assertGreaterEqual(result.x, min_x)
        self.assertLessEqual(result.x, max_x)
        self.assertGreaterEqual(result.y, min_y)
        self.assertLessEqual(result.y, max_y)

        existing_rects = _get_top_level_section_rects(self.project_state)
        self.assertFalse(_rect_overlaps_existing(result, width, height, existing_rects))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
