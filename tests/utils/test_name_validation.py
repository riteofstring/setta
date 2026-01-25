import unittest

from setta.types.code_obj_impls import CodeCallableCodeObjImpl, CodeParamCodeObjImpl
from setta.types.core import Core
from setta.types.generated.impl_args_as_typed_dicts import (
    CodeCallableCodeObjImplArgsWithCallable,
    CallableSectionImplArgsWithCallable,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.id import ID
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
    set_curr_effective_code_obj_impl_value,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import (
    add_code_obj,
    add_kwarg,
    create_child_sections,
    create_top_level_section,
    move_sections_to_parent_section,
    set_project_config_name,
    set_section_name,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    SectionType,
)
from setta.utils.errors import InvalidParamName, InvalidProjectName, InvalidSectionName
from setta.utils.name_validation import (
    _resolve_section_full_path_name,
    collect_section_name_conflicts,
    validate_param_name,
)


def _ensure_callable_root(
    project_state: ProjectStateSingleConfig,
    section_id: ID,
) -> ID:
    callable_impl = CodeCallableCodeObjImpl()
    callable_core = Core(name="callable")
    add_code_obj(project_state, [section_id], callable_core, callable_impl)
    set_curr_effective_section_impl_value(
        project_state,
        section_id,
        CallableSectionImplArgsWithCallable(callable=callable_core.id),
    )
    return callable_core.id


class ProjectNameValidationTests(unittest.TestCase):
    def test_reserved_project_name_rejected(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        with self.assertRaises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "home")

    def test_settings_project_name_rejected(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        with self.assertRaises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "Settings")

    def test_project_name_rejects_path_separators(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        with self.assertRaises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "bad/name")

    def test_project_name_rejects_dotdot(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        with self.assertRaises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "bad..name")

    def test_project_name_rejects_leading_dot(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        with self.assertRaises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, ".dog")

    def test_project_name_rejects_special_chars(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        with self.assertRaises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "bad@name")

    def test_project_name_invalid_after_sanitization_rejected(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        with self.assertRaises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "__")

    def test_project_name_trims_whitespace(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        set_project_config_name(backend, project_config.id, "  Foo Bar  ")
        self.assertEqual(
            "Foo Bar",
            backend.projectConfigs[project_config.id].name,
        )

    def test_project_name_allows_simple_chars(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        set_project_config_name(backend, project_config.id, "Alpha-2 _Beta")
        self.assertEqual(
            "Alpha-2 _Beta",
            backend.projectConfigs[project_config.id].name,
        )

    def test_project_name_rejects_empty_after_trim(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        with self.assertRaises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "   ")

    def test_project_slug_collision_rejected(self) -> None:
        primary = ProjectConfig(name="foo_bar")
        secondary = ProjectConfig(name="secondary")
        backend = ProjectStateBackend(
            projectConfigs={primary.id: primary, secondary.id: secondary},
            defaultProjectConfigId=primary.id,
        )
        with self.assertRaises(InvalidProjectName):
            set_project_config_name(backend, secondary.id, "foo bar")


class SectionNameValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_duplicate_sibling_name_rejected(self) -> None:
        first = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        second = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        set_section_name(self.project_state, first, "Duplicate")
        with self.assertRaises(InvalidSectionName):
            set_section_name(self.project_state, second, "Duplicate")

    def test_section_slug_collision_rejected(self) -> None:
        first = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        second = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        set_section_name(self.project_state, first, "Foo_Bar")
        with self.assertRaises(InvalidSectionName):
            set_section_name(self.project_state, second, "Foo Bar")

    def test_section_name_rejects_dotdot(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        with self.assertRaises(InvalidSectionName):
            set_section_name(self.project_state, section_id, "bad..name")

    def test_section_name_trims_whitespace(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        set_section_name(self.project_state, section_id, "  Section One  ")
        self.assertEqual("Section One", self.project_state.sections[section_id].name)

    def test_section_name_allows_simple_chars(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        set_section_name(self.project_state, section_id, "Group-1 _X")
        self.assertEqual("Group-1 _X", self.project_state.sections[section_id].name)

    def test_section_name_rejects_empty_after_trim(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        with self.assertRaises(InvalidSectionName):
            set_section_name(self.project_state, section_id, "   ")

    def test_section_name_rejects_leading_dot(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        with self.assertRaises(InvalidSectionName):
            set_section_name(self.project_state, section_id, ".dog")

    def test_section_name_rejects_special_chars(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Code,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        with self.assertRaises(InvalidSectionName):
            set_section_name(self.project_state, section_id, "bad#name")

    def test_nested_list_root_path_uses_immediate_parent(self) -> None:
        parent_group = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Group,
            Position(),
        )
        child_group = create_child_sections(
            self.settings,
            self.project_state,
            parent_group,
            SectionType.Group,
            1,
            None,
        )[0]
        list_root = create_child_sections(
            self.settings,
            self.project_state,
            child_group,
            SectionType.ListRoot,
            1,
            None,
        )[0]
        self.project_state.validate_parent_section_map()
        parent_name = self.project_state.sections[parent_group].name
        child_name = self.project_state.sections[child_group].name
        child_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            child_group,
            BaseParentSectionImpl,
        )
        idx = child_impl.children.index(list_root)
        full_name = _resolve_section_full_path_name(self.project_state, list_root)
        self.assertEqual(
            f'{parent_name}["{child_name}"][{idx}]',
            full_name,
        )

    def test_move_conflict_marks_invalid_and_clears_bindings(self) -> None:
        parent_a = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Group,
            Position(),
        )
        parent_b = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Group,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        set_section_name(self.project_state, parent_a, "Group A")
        set_section_name(self.project_state, parent_b, "Group B")
        child_a = create_child_sections(
            self.settings,
            self.project_state,
            parent_a,
            SectionType.Code,
            1,
            None,
        )[0]
        child_b = create_child_sections(
            self.settings,
            self.project_state,
            parent_b,
            SectionType.Code,
            1,
            None,
        )[0]
        self.project_state.validate_parent_section_map()
        set_section_name(self.project_state, child_a, "Foo Bar")
        set_section_name(self.project_state, child_b, "Foo Bar")
        self.project_state.validate_parent_section_map()
        self.project_state.validate_code_file_bindings()
        impl_a = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            child_a,
            BaseCodeSectionImpl,
        )
        impl_b = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            child_b,
            BaseCodeSectionImpl,
        )
        self.assertIsNotNone(impl_a.codeFileBinding)
        self.assertIsNotNone(impl_b.codeFileBinding)

        move_sections_to_parent_section(
            self.project_state,
            parent_a,
            [child_b],
            1,
        )
        self.project_state.validate_parent_section_map()
        self.project_state.validate_code_file_bindings()

        impl_a_after = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            child_a,
            BaseCodeSectionImpl,
        )
        impl_b_after = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            child_b,
            BaseCodeSectionImpl,
        )
        self.assertIsNone(impl_a_after.codeFileBinding)
        self.assertIsNone(impl_b_after.codeFileBinding)

        conflicts = collect_section_name_conflicts(self.project_state)
        self.assertIn(child_a, conflicts)
        self.assertIn(child_b, conflicts)


class ParamNameValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_param_name_allows_empty_for_editable_kwarg(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        param_id = add_kwarg(self.settings, self.project_state, section_id)
        normalized = validate_param_name(
            self.project_state,
            section_id,
            param_id,
            "",
        )
        self.assertEqual("", normalized)

    def test_param_name_allows_empty_for_dict_root(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        add_kwarg(self.settings, self.project_state, section_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            BaseDictSectionImpl,
        )
        if section_impl.topLevelParamId is None:
            raise KeyError("Expected dict section to have a topLevelParamId.")
        normalized = validate_param_name(
            self.project_state,
            section_id,
            section_impl.topLevelParamId,
            "",
        )
        self.assertEqual("", normalized)

    def test_param_name_requires_python_identifier(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Callable,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        _ensure_callable_root(self.project_state, section_id)
        param_id = add_kwarg(self.settings, self.project_state, section_id)
        with self.assertRaises(InvalidParamName):
            validate_param_name(
                self.project_state,
                section_id,
                param_id,
                "invalid name",
            )

    def test_param_name_rejects_python_keyword(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Callable,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        _ensure_callable_root(self.project_state, section_id)
        param_id = add_kwarg(self.settings, self.project_state, section_id)
        with self.assertRaises(InvalidParamName):
            validate_param_name(
                self.project_state,
                section_id,
                param_id,
                "class",
            )

    def test_param_name_rejects_path_separators(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Callable,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        _ensure_callable_root(self.project_state, section_id)
        param_id = add_kwarg(self.settings, self.project_state, section_id)
        with self.assertRaises(InvalidParamName):
            validate_param_name(
                self.project_state,
                section_id,
                param_id,
                "bad/name",
            )

    def test_param_name_rejects_empty_for_non_editable_param(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Callable,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        callable_id = _ensure_callable_root(self.project_state, section_id)

        param_impl = CodeParamCodeObjImpl(coreNameEditable=False)
        param_core = Core(name="param")
        add_code_obj(self.project_state, [section_id], param_core, param_impl)
        set_curr_effective_code_obj_impl_value(
            self.project_state,
            section_id,
            callable_id,
            CodeCallableCodeObjImplArgsWithCallable(children=[param_core.id]),
        )

        with self.assertRaises(InvalidParamName):
            validate_param_name(
                self.project_state,
                section_id,
                param_core.id,
                "",
            )

    def test_dict_param_name_allows_punctuation(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        param_id = add_kwarg(self.settings, self.project_state, section_id)
        normalized = validate_param_name(
            self.project_state,
            section_id,
            param_id,
            "user-id@v2",
        )
        self.assertEqual("user-id@v2", normalized)

    def test_dict_param_name_allows_path_like_keys(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        param_id = add_kwarg(self.settings, self.project_state, section_id)
        normalized = validate_param_name(
            self.project_state,
            section_id,
            param_id,
            "foo/bar..baz",
        )
        self.assertEqual("foo/bar..baz", normalized)

    def test_dict_param_name_rejects_control_chars(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        param_id = add_kwarg(self.settings, self.project_state, section_id)
        with self.assertRaises(InvalidParamName):
            validate_param_name(
                self.project_state,
                section_id,
                param_id,
                "bad\nname",
            )

    def test_param_name_duplicate_rejected(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        first_param = add_kwarg(self.settings, self.project_state, section_id)
        second_param = add_kwarg(self.settings, self.project_state, section_id)
        self.project_state.codeObjs[first_param].name = "alpha"
        with self.assertRaises(InvalidParamName):
            validate_param_name(
                self.project_state,
                section_id,
                second_param,
                "alpha",
            )
