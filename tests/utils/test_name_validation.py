from pathlib import Path

import pytest

from setta.code_gen.utils import sanitize_slug
from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    ParameterPassingStyle,
)
from setta.types.core import Core
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseParamCodeObjImplArgsWithCallable,
    CodeCallableCodeObjImplArgsWithCallable,
    CallableSectionImplArgsWithCallable,
)
from tests.helpers.settings_state import SettingsState
from setta.types.id import ID
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import (
    get_section_path_full_name,
)
from setta.types.project_config import (
    Position,
    ProjectConfig,
)
from setta.types.project_state import (
    CODE_LANGUAGE_EXTENSIONS,
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    CodeFileAccessMode,
    CodeFileBinding,
    SectionType,
)
from setta.utils.constants import C
from setta.utils.errors import (
    InvalidParamName,
    InvalidProjectName,
    InvalidSectionName,
)
from setta.utils.name_validation import (
    _resolve_section_full_path_name,
    validate_param_name,
)
from setta.utils.paths import normalize_state_path
from setta.utils.utils import build_project_sections_dir
from tests.helpers.setta_paths import normalize_workspace_path
from tests.helpers.project_state_mutations import (
    add_code_obj,
    add_kwarg,
    set_project_config_name,
    set_section_name,
)
from tests.helpers.project_state_effective_impls import (
    set_curr_effective_code_obj_impl_value,
)
from tests.helpers.project_state_sections import (
    create_child_sections,
    create_top_level_section,
    move_sections_to_parent_section,
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


@pytest.fixture
def settings_and_project_state() -> tuple[SettingsState, ProjectStateSingleConfig]:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="test-project")
    )
    return settings, project_state


class TestProjectNameValidation:
    def test_reserved_project_name_rejected(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "home")

    def test_settings_project_name_rejected(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "Settings")

    def test_project_name_rejects_path_separators(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "bad/name")

    def test_project_name_rejects_dotdot(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "bad..name")

    def test_project_name_rejects_leading_dot(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, ".dog")

    def test_project_name_rejects_special_chars(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "bad@name")

    def test_project_name_invalid_after_sanitization_rejected(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "__")

    def test_project_name_trims_whitespace(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        set_project_config_name(backend, project_config.id, "  Foo Bar  ")
        assert backend.projectConfigs[project_config.id].name == "Foo Bar"

    def test_project_name_allows_simple_chars(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        set_project_config_name(backend, project_config.id, "Alpha-2 _Beta")
        assert backend.projectConfigs[project_config.id].name == "Alpha-2 _Beta"

    def test_project_name_rejects_empty_after_trim(self) -> None:
        project_config = ProjectConfig(name="valid-project")
        backend = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            projectChatWindowingByProjectConfigId={project_config.id: {}},
            defaultProjectConfigId=project_config.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, project_config.id, "   ")

    def test_project_slug_collision_rejected(self) -> None:
        primary = ProjectConfig(name="foo_bar")
        secondary = ProjectConfig(name="secondary")
        backend = ProjectStateBackend(
            projectConfigs={primary.id: primary, secondary.id: secondary},
            projectChatWindowingByProjectConfigId={primary.id: {}, secondary.id: {}},
            defaultProjectConfigId=primary.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, secondary.id, "foo bar")

    def test_project_slug_collision_case_insensitive_rejected(self) -> None:
        primary = ProjectConfig(name="Foo")
        secondary = ProjectConfig(name="secondary")
        backend = ProjectStateBackend(
            projectConfigs={primary.id: primary, secondary.id: secondary},
            projectChatWindowingByProjectConfigId={primary.id: {}, secondary.id: {}},
            defaultProjectConfigId=primary.id,
        )
        with pytest.raises(InvalidProjectName):
            set_project_config_name(backend, secondary.id, "foo")


class TestSectionNameValidation:
    def test_duplicate_sibling_name_rejected(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        first = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        second = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, first, "Duplicate")
        with pytest.raises(InvalidSectionName):
            set_section_name(project_state, second, "Duplicate")

    def test_section_slug_collision_rejected(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        first = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        second = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, first, "Foo_Bar")
        with pytest.raises(InvalidSectionName):
            set_section_name(project_state, second, "Foo Bar")

    def test_section_slug_collision_case_insensitive_rejected(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        first = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        second = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, first, "Foo")
        with pytest.raises(InvalidSectionName):
            set_section_name(project_state, second, "foo")

    def test_top_level_python_identifier_conflict_rejected(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        first = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        second = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, first, "Foo-Bar")
        with pytest.raises(InvalidSectionName):
            set_section_name(project_state, second, "Foo Bar")

    def test_section_name_rejects_dotdot(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        with pytest.raises(InvalidSectionName):
            set_section_name(project_state, section_id, "bad..name")

    def test_section_name_trims_whitespace(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, section_id, "  Section One  ")
        assert project_state.sections[section_id].name == "Section One"

    def test_section_name_allows_simple_chars(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, section_id, "Group-1 _X")
        assert project_state.sections[section_id].name == "Group-1 _X"

    def test_section_name_allows_chat_slug_with_namespaced_routes(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, section_id, "Chat_")
        assert project_state.sections[section_id].name == "Chat_"

    def test_section_name_rejects_empty_after_trim(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        with pytest.raises(InvalidSectionName):
            set_section_name(project_state, section_id, "   ")

    def test_section_name_rejects_leading_dot(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        with pytest.raises(InvalidSectionName):
            set_section_name(project_state, section_id, ".dog")

    def test_section_name_rejects_special_chars(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        with pytest.raises(InvalidSectionName):
            set_section_name(project_state, section_id, "bad#name")

    def test_nested_list_root_path_uses_immediate_parent(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        parent_group = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(),
        )
        child_group = create_child_sections(
            settings,
            project_state,
            parent_group,
            SectionType.Group,
            1,
            None,
        )[0]
        list_root = create_child_sections(
            settings,
            project_state,
            child_group,
            SectionType.ListRoot,
            1,
            None,
        )[0]
        project_state.validate_parent_section_map()
        parent_name = project_state.sections[parent_group].name
        child_name = project_state.sections[child_group].name
        child_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            child_group,
            BaseParentSectionImpl,
        )
        idx = child_impl.children.index(list_root)
        full_name = _resolve_section_full_path_name(project_state, list_root)
        assert full_name == f'{parent_name}["{child_name}"][{idx}]'

    def test_section_path_full_name_uses_list_root_index_for_children(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        parent_group = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(),
            core_overrides={"name": "Parent"},
        )
        child_group = create_child_sections(
            settings,
            project_state,
            parent_group,
            SectionType.Group,
            1,
            None,
        )[0]
        list_root = create_child_sections(
            settings,
            project_state,
            child_group,
            SectionType.ListRoot,
            1,
            None,
        )[0]
        leaf_section = create_child_sections(
            settings,
            project_state,
            list_root,
            SectionType.Code,
            1,
            None,
        )[0]
        project_state.validate_parent_section_map()
        set_section_name(project_state, child_group, "Child")
        set_section_name(project_state, leaf_section, "Leaf")
        list_parent_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            child_group,
            BaseParentSectionImpl,
        )
        idx = list_parent_impl.children.index(list_root)
        expected = 'Parent["Child"][{idx}]["Leaf"]'.format(idx=idx)
        actual = get_section_path_full_name(project_state, leaf_section)
        assert actual == expected

    def test_move_conflict_marks_invalid_and_clears_bindings(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        parent_a = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(),
        )
        parent_b = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, parent_a, "Group A")
        set_section_name(project_state, parent_b, "Group B")
        child_a = create_child_sections(
            settings,
            project_state,
            parent_a,
            SectionType.Code,
            1,
            None,
        )[0]
        child_b = create_child_sections(
            settings,
            project_state,
            parent_b,
            SectionType.Code,
            1,
            None,
        )[0]
        project_state.validate_parent_section_map()
        set_section_name(project_state, child_a, "Foo Bar")
        set_section_name(project_state, child_b, "Foo Bar")
        project_state.validate_parent_section_map()
        project_state.validate_code_file_bindings()
        impl_a = get_curr_effective_section_impl_with_type_guard(
            project_state,
            child_a,
            BaseCodeSectionImpl,
        )
        impl_b = get_curr_effective_section_impl_with_type_guard(
            project_state,
            child_b,
            BaseCodeSectionImpl,
        )
        assert impl_a.codeFileBinding is not None
        assert impl_b.codeFileBinding is not None

        move_sections_to_parent_section(
            project_state,
            parent_a,
            [child_b],
            1,
        )
        project_state.validate_parent_section_map()
        project_state.validate_code_file_bindings()

        impl_a_after = get_curr_effective_section_impl_with_type_guard(
            project_state,
            child_a,
            BaseCodeSectionImpl,
        )
        impl_b_after = get_curr_effective_section_impl_with_type_guard(
            project_state,
            child_b,
            BaseCodeSectionImpl,
        )
        assert impl_a_after.codeFileBinding is None
        assert impl_b_after.codeFileBinding is None

    def test_move_conflict_preserves_manual_binding(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        parent_a = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(),
        )
        parent_b = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, parent_a, "Group A")
        set_section_name(project_state, parent_b, "Group B")
        child_a = create_child_sections(
            settings,
            project_state,
            parent_a,
            SectionType.Code,
            1,
            None,
        )[0]
        child_b = create_child_sections(
            settings,
            project_state,
            parent_b,
            SectionType.Code,
            1,
            None,
        )[0]
        project_state.validate_parent_section_map()
        set_section_name(project_state, child_a, "Foo Bar")
        set_section_name(project_state, child_b, "Foo Bar")
        project_state.validate_parent_section_map()
        project_state.validate_code_file_bindings()

        manual_binding = CodeFileBinding(
            canonical_path=Path("custom/manual_binding.py"),
            access_mode=CodeFileAccessMode.read_write,
            autoBinding=False,
        )
        set_curr_effective_section_impl_value(
            project_state,
            child_b,
            {
                "codeFileBinding": manual_binding.model_copy(
                    update={
                        "canonical_path": normalize_workspace_path(
                            manual_binding.canonical_path
                        )
                    }
                )
            },
        )

        move_sections_to_parent_section(
            project_state,
            parent_a,
            [child_b],
            1,
        )
        project_state.validate_parent_section_map()
        project_state.validate_code_file_bindings()

        impl_a_after = get_curr_effective_section_impl_with_type_guard(
            project_state,
            child_a,
            BaseCodeSectionImpl,
        )
        impl_b_after = get_curr_effective_section_impl_with_type_guard(
            project_state,
            child_b,
            BaseCodeSectionImpl,
        )
        assert impl_a_after.codeFileBinding is None
        assert impl_b_after.codeFileBinding is not None
        assert impl_b_after.codeFileBinding.canonical_path == normalize_workspace_path(
            "custom/manual_binding.py"
        )

    def test_validate_code_file_bindings_does_not_promote_manual_binding(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            BaseCodeSectionImpl,
        )
        section_full_name = get_section_path_full_name(project_state, section_id)
        section_slug = sanitize_slug(section_full_name)
        extension = CODE_LANGUAGE_EXTENSIONS[impl.codeLanguage]
        code_root = normalize_state_path(C.CODE_FOLDER)
        canonical_sections_dir = build_project_sections_dir(
            code_root, project_state.projectConfig.name
        )
        canonical_path = normalize_state_path(
            canonical_sections_dir / f"{section_slug}.{extension}"
        )
        legacy_binding = CodeFileBinding(
            canonical_path=canonical_path,
            access_mode=CodeFileAccessMode.read_write,
            autoBinding=False,
        )
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            {"codeFileBinding": legacy_binding},
        )
        project_state.validate_code_file_bindings()
        impl_after = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            BaseCodeSectionImpl,
        )
        assert impl_after.codeFileBinding is not None
        assert impl_after.codeFileBinding.autoBinding is False


class TestParamNameValidation:
    def test_param_name_allows_empty_for_editable_kwarg(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Dict,
            Position(),
        )
        project_state.validate_parent_section_map()
        param_id = add_kwarg(settings, project_state, section_id)
        normalized = validate_param_name(
            project_state,
            section_id,
            param_id,
            "",
        )
        assert normalized == ""

    def test_param_name_allows_empty_for_dict_root(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Dict,
            Position(),
        )
        project_state.validate_parent_section_map()
        add_kwarg(settings, project_state, section_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            BaseDictSectionImpl,
        )
        if section_impl.topLevelParamId is None:
            raise KeyError("Expected dict section to have a topLevelParamId.")
        normalized = validate_param_name(
            project_state,
            section_id,
            section_impl.topLevelParamId,
            "",
        )
        assert normalized == ""

    def test_param_name_requires_python_identifier(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Callable,
            Position(),
        )
        project_state.validate_parent_section_map()
        _ensure_callable_root(project_state, section_id)
        param_id = add_kwarg(settings, project_state, section_id)
        with pytest.raises(InvalidParamName):
            validate_param_name(
                project_state,
                section_id,
                param_id,
                "invalid name",
            )

    @pytest.mark.parametrize(
        "passing_style",
        (
            ParameterPassingStyle.ARGS,
            ParameterPassingStyle.KWARGS,
            ParameterPassingStyle.POSITIONAL_ONLY,
        ),
    )
    def test_param_name_requires_identifier_for_non_default_passing_styles(
        self,
        settings_and_project_state,
        passing_style,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Callable,
            Position(),
        )
        project_state.validate_parent_section_map()
        _ensure_callable_root(project_state, section_id)
        param_id = add_kwarg(settings, project_state, section_id)
        set_curr_effective_code_obj_impl_value(
            project_state,
            section_id,
            param_id,
            BaseParamCodeObjImplArgsWithCallable(
                passingStyle=passing_style,
            ),
        )
        with pytest.raises(InvalidParamName):
            validate_param_name(
                project_state,
                section_id,
                param_id,
                "invalid name",
            )

    def test_param_name_rejects_python_keyword(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Callable,
            Position(),
        )
        project_state.validate_parent_section_map()
        _ensure_callable_root(project_state, section_id)
        param_id = add_kwarg(settings, project_state, section_id)
        with pytest.raises(InvalidParamName):
            validate_param_name(
                project_state,
                section_id,
                param_id,
                "class",
            )

    def test_param_name_rejects_python_soft_keyword(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Callable,
            Position(),
        )
        project_state.validate_parent_section_map()
        _ensure_callable_root(project_state, section_id)
        param_id = add_kwarg(settings, project_state, section_id)
        with pytest.raises(InvalidParamName):
            validate_param_name(
                project_state,
                section_id,
                param_id,
                "type",
            )

    def test_param_name_rejects_unicode_identifier(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Callable,
            Position(),
        )
        project_state.validate_parent_section_map()
        _ensure_callable_root(project_state, section_id)
        param_id = add_kwarg(settings, project_state, section_id)
        with pytest.raises(InvalidParamName):
            validate_param_name(
                project_state,
                section_id,
                param_id,
                "café",
            )

    def test_param_name_rejects_path_separators(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Callable,
            Position(),
        )
        project_state.validate_parent_section_map()
        _ensure_callable_root(project_state, section_id)
        param_id = add_kwarg(settings, project_state, section_id)
        with pytest.raises(InvalidParamName):
            validate_param_name(
                project_state,
                section_id,
                param_id,
                "bad/name",
            )

    def test_param_name_rejects_empty_for_non_editable_param(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Callable,
            Position(),
        )
        project_state.validate_parent_section_map()
        callable_id = _ensure_callable_root(project_state, section_id)

        param_impl = CodeParamCodeObjImpl(coreNameEditable=False)
        param_core = Core(name="param")
        add_code_obj(project_state, [section_id], param_core, param_impl)
        set_curr_effective_code_obj_impl_value(
            project_state,
            section_id,
            callable_id,
            CodeCallableCodeObjImplArgsWithCallable(children=[param_core.id]),
        )

        with pytest.raises(InvalidParamName):
            validate_param_name(
                project_state,
                section_id,
                param_core.id,
                "",
            )

    def test_dict_param_name_allows_punctuation(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Dict,
            Position(),
        )
        project_state.validate_parent_section_map()
        param_id = add_kwarg(settings, project_state, section_id)
        normalized = validate_param_name(
            project_state,
            section_id,
            param_id,
            "user-id@v2",
        )
        assert normalized == "user-id@v2"

    def test_dict_param_name_allows_path_like_keys(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Dict,
            Position(),
        )
        project_state.validate_parent_section_map()
        param_id = add_kwarg(settings, project_state, section_id)
        normalized = validate_param_name(
            project_state,
            section_id,
            param_id,
            "foo/bar..baz",
        )
        assert normalized == "foo/bar..baz"

    def test_dict_param_name_rejects_control_chars(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Dict,
            Position(),
        )
        project_state.validate_parent_section_map()
        param_id = add_kwarg(settings, project_state, section_id)
        with pytest.raises(InvalidParamName):
            validate_param_name(
                project_state,
                section_id,
                param_id,
                "bad\nname",
            )

    def test_param_name_duplicate_rejected(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Dict,
            Position(),
        )
        project_state.validate_parent_section_map()
        first_param = add_kwarg(settings, project_state, section_id)
        second_param = add_kwarg(settings, project_state, section_id)
        project_state.codeObjs[first_param].name = "alpha"
        with pytest.raises(InvalidParamName):
            validate_param_name(
                project_state,
                section_id,
                second_param,
                "alpha",
            )
