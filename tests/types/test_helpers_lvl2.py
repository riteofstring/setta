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
    indent_params,
    move_params_to_parent,
    move_params_within_parent,
    set_text_block_heading_as_section_name,
    set_text_block_text,
    set_chat_section_chat_id,
    set_section_param_filter,
    unindent_params,
)
from setta.types.project_config import (
    Position,
    ProjectConfig,
    TopLevelSectionLayout,
    ViewportBounds,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.id import ID
from setta.types.section_impls import (
    BaseDictSectionImpl,
    ChatSectionImpl,
    SectionSize,
    SectionType,
    TextBlockSectionImpl,
)


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


class ChatSectionChatIdTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_set_chat_section_chat_id_updates_impl(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(),
        )
        chat_id = ID("chat-1")

        set_chat_section_chat_id(self.project_state, section_id, chat_id)

        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            ChatSectionImpl,
        )
        self.assertEqual(section_impl.chatId, chat_id)


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


class ParamMoveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        self.section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.param_ids = [
            add_kwarg(self.settings, self.project_state, self.section_id)
            for _ in range(3)
        ]
        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            self.section_id,
            BaseDictSectionImpl,
        )
        self.root_id = section_impl.topLevelParamId
        assert self.root_id is not None

    def _get_root_impl(self) -> NestedParamCodeObjImpl:
        return get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.root_id,
            NestedParamCodeObjImpl,
        )

    def test_move_params_within_parent_reorders(self) -> None:
        move_params_within_parent(
            self.project_state,
            self.section_id,
            [self.param_ids[0]],
            new_index=2,
        )

        root_impl = self._get_root_impl()
        self.assertEqual(
            root_impl.children,
            [self.param_ids[1], self.param_ids[2], self.param_ids[0]],
        )

    def test_param_filter_whitespace_allows_reorder(self) -> None:
        set_section_param_filter(self.project_state, self.section_id, "   ")

        move_params_within_parent(
            self.project_state,
            self.section_id,
            [self.param_ids[0]],
            new_index=2,
        )

        root_impl = self._get_root_impl()
        self.assertEqual(
            root_impl.children,
            [self.param_ids[1], self.param_ids[2], self.param_ids[0]],
        )

    def test_indent_converts_previous_sibling(self) -> None:
        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[1]],
        )

        root_impl = self._get_root_impl()
        self.assertEqual(root_impl.children, [self.param_ids[0], self.param_ids[2]])

        parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_ids[0],
            NestedParamCodeObjImpl,
        )
        self.assertEqual(parent_impl.children, [self.param_ids[1]])

    def test_indent_non_contiguous_groups(self) -> None:
        extra_param = add_kwarg(self.settings, self.project_state, self.section_id)
        param_ids = [*self.param_ids, extra_param]

        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [param_ids[1], param_ids[3]],
        )

        root_impl = self._get_root_impl()
        self.assertEqual(root_impl.children, [param_ids[0], param_ids[2]])

        first_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            param_ids[0],
            NestedParamCodeObjImpl,
        )
        self.assertEqual(first_parent_impl.children, [param_ids[1]])

        second_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            param_ids[2],
            NestedParamCodeObjImpl,
        )
        self.assertEqual(second_parent_impl.children, [param_ids[3]])

    def test_unindent_converts_empty_nested(self) -> None:
        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[1]],
        )
        unindent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[1]],
        )

        root_impl = self._get_root_impl()
        self.assertEqual(
            root_impl.children,
            [self.param_ids[0], self.param_ids[1], self.param_ids[2]],
        )

        parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_ids[0],
            CodeParamCodeObjImpl,
        )
        self.assertEqual(parent_impl.value, "{}")

    def test_unindent_multi_parent_selection(self) -> None:
        extra_param = add_kwarg(self.settings, self.project_state, self.section_id)
        param_ids = [*self.param_ids, extra_param]

        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [param_ids[1], param_ids[3]],
        )
        unindent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [param_ids[1], param_ids[3]],
        )

        root_impl = self._get_root_impl()
        self.assertEqual(root_impl.children, param_ids)

        first_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            param_ids[0],
            CodeParamCodeObjImpl,
        )
        self.assertEqual(first_parent_impl.value, "{}")

        second_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            param_ids[2],
            CodeParamCodeObjImpl,
        )
        self.assertEqual(second_parent_impl.value, "{}")

    def test_move_params_to_parent_reparents(self) -> None:
        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[1]],
        )

        move_params_to_parent(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[2]],
            self.param_ids[0],
            new_index=1,
        )

        root_impl = self._get_root_impl()
        self.assertEqual(root_impl.children, [self.param_ids[0]])

        parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_ids[0],
            NestedParamCodeObjImpl,
        )
        self.assertEqual(parent_impl.children, [self.param_ids[1], self.param_ids[2]])


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


class TextBlockHeadingAsNameTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_invalid_heading_does_not_block_text_update(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        original_name = self.project_state.sections[section_id].name
        set_text_block_heading_as_section_name(
            self.project_state,
            section_id,
            True,
        )
        text = "# Intro @ 2026\n\nBody content."
        set_text_block_text(self.project_state, section_id, text)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            TextBlockSectionImpl,
        )
        self.assertEqual(text, section_impl.text)
        self.assertEqual(original_name, self.project_state.sections[section_id].name)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
