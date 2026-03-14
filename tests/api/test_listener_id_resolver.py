import pytest

from setta.api.listener import ListenerDependencyIds, ListenerRuntimeState
from setta.code_gen.dependency_graph import DependencyGraph
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import add_kwarg, create_top_level_section
from setta.types.dependency_key import SectionParamDependencyKey
from setta.types.id import ID
from setta.types.project_config import (
    Position,
    ProjectConfig,
    TopLevelSectionLayout,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    BaseDictSectionImpl,
    GroupSectionImpl,
    SectionType,
    TextBlockSectionImpl,
)


def _build_runtime_state(
    project_state: ProjectStateSingleConfig,
) -> ListenerRuntimeState:
    dependency_graph = DependencyGraph(project_state)
    return ListenerRuntimeState(
        project_state=project_state,
        dependency_graph=dependency_graph,
        s_instance=None,
    )


def _build_project_state_with_duplicate_sections():
    group_impl = GroupSectionImpl(
        id=ID("impl-group"),
        name="Settings Group",
        children=[ID("section-child-1"), ID("section-child-2")],
    )
    first_child_impl = TextBlockSectionImpl(
        id=ID("impl-child-1"),
        name="Item",
        text="Alpha",
    )
    second_child_impl = TextBlockSectionImpl(
        id=ID("impl-child-2"),
        name="Item",
        text="Beta",
    )

    group_variant = Variant(
        id=ID("variant-group"),
        name="Default",
        impl=group_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(group_impl),
    )
    first_child_variant = Variant(
        id=ID("variant-child-1"),
        name="Default",
        impl=first_child_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(first_child_impl),
    )
    second_child_variant = Variant(
        id=ID("variant-child-2"),
        name="Default",
        impl=second_child_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(second_child_impl),
    )

    group_core = Core(
        id=ID("section-group"),
        name="Settings Group",
        variants=[group_variant.id],
        defaultVariant=group_variant.id,
    )
    first_child_core = Core(
        id=ID("section-child-1"),
        name="Item",
        variants=[first_child_variant.id],
        defaultVariant=first_child_variant.id,
    )
    second_child_core = Core(
        id=ID("section-child-2"),
        name="Item",
        variants=[second_child_variant.id],
        defaultVariant=second_child_variant.id,
    )

    project_config = ProjectConfig(
        id=ID("project-listener"),
        name="Listener Project",
        sectionVariantMap={
            group_core.id: group_variant.id,
            first_child_core.id: first_child_variant.id,
            second_child_core.id: second_child_variant.id,
        },
        topLevelSections={
            group_core.id: TopLevelSectionLayout(),
        },
    )

    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={
            group_core.id: group_core,
            first_child_core.id: first_child_core,
            second_child_core.id: second_child_core,
        },
        sectionImpls={
            group_impl.id: group_impl,
            first_child_impl.id: first_child_impl,
            second_child_impl.id: second_child_impl,
        },
        sectionVariants={
            group_variant.id: group_variant,
            first_child_variant.id: first_child_variant,
            second_child_variant.id: second_child_variant,
        },
    )
    return project_state, {
        "group": group_core.id,
        "child_1": first_child_core.id,
        "child_2": second_child_core.id,
    }


def _build_project_state_with_params():
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="Listener Project")
    )
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(),
    )
    project_state.validate_parent_section_map()
    kwarg_id = add_kwarg(settings, project_state, section_id)
    section_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        BaseDictSectionImpl,
    )
    top_level_param_id = section_impl.topLevelParamId
    if top_level_param_id is None:
        raise AssertionError("Expected topLevelParamId for dict section")
    if section_id not in project_state.sections:
        raise KeyError(f"Unknown section id: {section_id}")
    project_state.sections[section_id].name = "Inputs"
    if top_level_param_id not in project_state.codeObjs:
        raise KeyError(f"Unknown code obj id: {top_level_param_id}")
    project_state.codeObjs[top_level_param_id].name = "root"
    if kwarg_id not in project_state.codeObjs:
        raise KeyError(f"Unknown code obj id: {kwarg_id}")
    project_state.codeObjs[kwarg_id].name = "alpha"
    return project_state, section_id, kwarg_id


class TestListenerDependencyIds:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        project_state, ids = _build_project_state_with_duplicate_sections()
        runtime_state = _build_runtime_state(project_state)
        self.ids_helper = ListenerDependencyIds(
            runtime_state.dependency_graph, runtime_state.project_state
        )
        self.ids = ids

    def test_dependency_name_resolves_section(self) -> None:
        resolved = self.ids_helper.section_id("Settings_Group__Item_2")
        assert resolved == self.ids["child_2"]

    def test_resolve_payload_maps_section_dependencies(self) -> None:
        resolved = self.ids_helper.section_ids(
            ["Settings_Group", "Settings_Group__Item_2"]
        )
        assert resolved == [self.ids["group"], self.ids["child_2"]]

    def test_resolve_payload_maps_param_dependency(self) -> None:
        project_state, section_id, kwarg_id = _build_project_state_with_params()
        runtime_state = _build_runtime_state(project_state)
        dependency_name = _find_param_dependency_name(
            runtime_state.dependency_graph, kwarg_id
        )
        ids_helper = ListenerDependencyIds(
            runtime_state.dependency_graph, runtime_state.project_state
        )
        param_ids = ids_helper.param_ids(dependency_name)
        assert param_ids.sectionId == section_id
        assert param_ids.paramInfoId == kwarg_id


def _find_param_dependency_name(
    dependency_graph: DependencyGraph,
    code_obj_id: ID,
) -> str:
    for name, dep_key in dependency_graph.full_path_name_to_dep_key.items():
        if isinstance(dep_key, SectionParamDependencyKey):
            if dep_key.codeObjId == code_obj_id:
                return name
    raise AssertionError(f"Missing dependency for param {code_obj_id}")
