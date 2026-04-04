from pathlib import Path

import pytest

from setta.code_gen.utils import sanitize_slug
from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeObjType,
    CodeParamCodeObjImpl,
    ParameterPassingStyle,
)
from setta.types.core import Core
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseParamCodeObjImplArgsWithCallable,
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
    add_meta_control_code_obj,
    create_child_sections,
    create_top_level_section,
    get_section_path_full_name,
    move_sections_to_parent_section,
    set_code_file_binding,
    set_project_config_name,
    set_section_name,
    set_text_block_heading_as_section_name,
    set_text_block_text,
)
from setta.types.project_config import (
    Position,
    ProjectConfig,
    ViewModeConfig,
    WindowSpaceConfig,
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
    MetaControlSectionImpl,
    SectionType,
)
from setta.utils.constants import C
from setta.utils.errors import (
    InvalidParamName,
    InvalidProjectName,
    InvalidSectionName,
    InvalidViewModeName,
    InvalidWindowSpaceName,
)
from setta.utils.name_validation import (
    _resolve_section_full_path_name,
    collect_param_name_format_errors,
    collect_project_name_format_errors,
    collect_section_name_conflicts,
    collect_section_name_format_errors,
    collect_text_block_heading_name_errors,
    validate_param_name,
    validate_view_mode_name,
    validate_window_space_name,
)
from setta.utils.paths import normalize_state_path, normalize_workspace_path
from setta.utils.utils import build_project_sections_dir


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

    def test_collect_project_name_format_errors_allows_settings_name(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name=C.SETTINGS_PROJECT_NAME)
        )
        assert collect_project_name_format_errors(project_state) == []

    def test_collect_project_name_format_errors_flags_invalid(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="bad/name")
        )
        assert collect_project_name_format_errors(project_state) == [
            "Project name cannot include path separators."
        ]


class TestViewModeNameValidation:
    def test_view_mode_name_rejects_reserved(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        view_mode = ViewModeConfig(name="Primary")
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        with pytest.raises(InvalidViewModeName):
            validate_view_mode_name(project_state, view_mode.id, "home")

    def test_view_mode_name_rejects_path_separators(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        view_mode = ViewModeConfig(name="Primary")
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        with pytest.raises(InvalidViewModeName):
            validate_view_mode_name(project_state, view_mode.id, "bad/name")

    def test_view_mode_name_rejects_dotdot(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        view_mode = ViewModeConfig(name="Primary")
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        with pytest.raises(InvalidViewModeName):
            validate_view_mode_name(project_state, view_mode.id, "bad..name")

    def test_view_mode_name_rejects_special_chars(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        view_mode = ViewModeConfig(name="Primary")
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        with pytest.raises(InvalidViewModeName):
            validate_view_mode_name(project_state, view_mode.id, "bad@name")

    def test_view_mode_name_invalid_after_sanitization_rejected(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        view_mode = ViewModeConfig(name="Primary")
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        with pytest.raises(InvalidViewModeName):
            validate_view_mode_name(project_state, view_mode.id, "__")

    def test_view_mode_name_trims_whitespace(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        view_mode = ViewModeConfig(name="Primary")
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        assert (
            validate_view_mode_name(project_state, view_mode.id, "  Foo Bar  ")
            == "Foo Bar"
        )

    def test_view_mode_name_allows_simple_chars(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        view_mode = ViewModeConfig(name="Primary")
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        assert (
            validate_view_mode_name(project_state, view_mode.id, "Alpha-2 _Beta")
            == "Alpha-2 _Beta"
        )

    def test_view_mode_slug_collision_rejected(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        primary = ViewModeConfig(name="foo_bar")
        secondary = ViewModeConfig(name="secondary")
        project_state.projectConfig.viewModes[primary.id] = primary
        project_state.projectConfig.viewModes[secondary.id] = secondary
        with pytest.raises(InvalidViewModeName):
            validate_view_mode_name(project_state, secondary.id, "foo bar")

    def test_view_mode_slug_collision_case_insensitive_rejected(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        primary = ViewModeConfig(name="Foo")
        secondary = ViewModeConfig(name="secondary")
        project_state.projectConfig.viewModes[primary.id] = primary
        project_state.projectConfig.viewModes[secondary.id] = secondary
        with pytest.raises(InvalidViewModeName):
            validate_view_mode_name(project_state, secondary.id, "foo")


class TestWindowSpaceNameValidation:
    def test_window_space_name_rejects_path_separators(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        with pytest.raises(InvalidWindowSpaceName):
            validate_window_space_name(project_state, None, "bad/name")

    def test_window_space_name_rejects_dotdot(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        with pytest.raises(InvalidWindowSpaceName):
            validate_window_space_name(project_state, None, "bad..name")

    def test_window_space_name_rejects_special_chars(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        with pytest.raises(InvalidWindowSpaceName):
            validate_window_space_name(project_state, None, "bad@name")

    def test_window_space_name_invalid_after_sanitization_rejected(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        with pytest.raises(InvalidWindowSpaceName):
            validate_window_space_name(project_state, None, "__")

    def test_window_space_name_trims_whitespace(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        assert (
            validate_window_space_name(project_state, None, "  Focused Layout  ")
            == "Focused Layout"
        )

    def test_window_space_name_allows_home_because_namespace_is_explicit(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        assert validate_window_space_name(project_state, None, "home") == "home"

    def test_window_space_slug_collision_rejected(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        project_state.projectConfig.windowSpaces["primary"] = (
            WindowSpaceConfig(
                id="primary",
                name="foo_bar",
                sortIndex=0,
            )
        )
        secondary = project_state.projectConfig.windowSpaces["secondary"] = (
            WindowSpaceConfig(
                id="secondary",
                name="secondary",
                sortIndex=1,
            )
        )
        with pytest.raises(InvalidWindowSpaceName):
            validate_window_space_name(project_state, secondary.id, "foo bar")

    def test_window_space_slug_collision_case_insensitive_rejected(self) -> None:
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        project_state.projectConfig.windowSpaces["primary"] = (
            WindowSpaceConfig(
                id="primary",
                name="Foo",
                sortIndex=0,
            )
        )
        secondary = project_state.projectConfig.windowSpaces["secondary"] = (
            WindowSpaceConfig(
                id="secondary",
                name="secondary",
                sortIndex=1,
            )
        )
        with pytest.raises(InvalidWindowSpaceName):
            validate_window_space_name(project_state, secondary.id, "foo")


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

    def test_collect_section_name_format_errors_flags_invalid(
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
        project_state.sections[section_id].name = "bad#name"
        errors = collect_section_name_format_errors(project_state)
        assert section_id in errors
        assert (
            "Section name can only contain letters, numbers, spaces, '_' and '-'.",
            errors[section_id],
        )

    def test_text_block_heading_name_error_flags_invalid_heading(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.TextBlock,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_text_block_heading_as_section_name(project_state, section_id, True)
        set_text_block_text(project_state, section_id, "# Bad/Name")
        errors = collect_text_block_heading_name_errors(project_state)
        assert section_id in errors
        assert (
            "Text block heading cannot be used as section name: Section name cannot include path separators.",
            errors[section_id],
        )

    def test_text_block_heading_name_error_flags_duplicate_sibling(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        text_block_id = create_top_level_section(
            settings,
            project_state,
            SectionType.TextBlock,
            Position(),
        )
        sibling_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(),
        )
        project_state.validate_parent_section_map()
        set_section_name(project_state, sibling_id, "Duplicate")
        set_text_block_heading_as_section_name(project_state, text_block_id, True)
        set_text_block_text(project_state, text_block_id, "# Duplicate")
        errors = collect_text_block_heading_name_errors(project_state)
        assert (
            'Text block heading cannot be used as section name: Section name "Duplicate" already exists under this parent.',
            errors[text_block_id],
        )

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

    def test_collect_section_name_conflicts_flags_python_identifier_collision(
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
        project_state.sections[first].name = "Foo-Bar"
        project_state.sections[second].name = "Foo Bar"
        conflicts = collect_section_name_conflicts(project_state)
        assert first in conflicts
        assert second in conflicts
        assert (
            "Section name conflicts with another top-level name after Python identifier sanitization.",
            conflicts[first],
        )

    def test_collect_section_name_conflicts_allows_chat_slug_with_namespaced_routes(
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
        project_state.sections[section_id].name = "Chat_"

        conflicts = collect_section_name_conflicts(project_state)

        assert section_id not in conflicts

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

        conflicts = collect_section_name_conflicts(project_state)
        assert child_a in conflicts
        assert child_b in conflicts

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
        set_code_file_binding(project_state, child_b, manual_binding)

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
        set_code_file_binding(project_state, section_id, legacy_binding)
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

    def test_collect_param_name_format_errors_flags_invalid(
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
        project_state.codeObjs[param_id].name = "invalid name"
        errors = collect_param_name_format_errors(project_state)
        assert param_id in errors
        assert (
            "Param name must be a valid Python identifier.",
            errors[param_id],
        )

    def test_collect_param_name_format_errors_flags_meta_control(
        self,
        settings_and_project_state,
    ) -> None:
        settings, project_state = settings_and_project_state
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.MetaControl,
            Position(),
        )
        project_state.validate_parent_section_map()
        add_meta_control_code_obj(
            settings,
            project_state,
            section_id,
            CodeObjType.SliderParam,
        )
        meta_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            MetaControlSectionImpl,
        )
        param_id = meta_impl.metaControlParamId
        assert param_id is not None
        project_state.codeObjs[param_id].name = "invalid name"
        errors = collect_param_name_format_errors(project_state)
        assert param_id in errors
        assert (
            "Param name must be a valid Python identifier.",
            errors[param_id],
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
