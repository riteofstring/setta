from setta.code_gen.dependency_graph import DependencyGraph, SectionNode
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import FileReadDependencyValue, LiteralDependencyValue
from setta.types.generated.impl_args_as_typed_dicts import DrawSectionImplArgsWithCallable
from tests.helpers.settings_state import SettingsState
from setta.types.helpers_lvl1 import set_curr_effective_section_impl_value
from setta.types.project_config import (
    Position,
    ProjectConfig,
    SectionCodegenMode,
    SectionRepresentationMode,
    SectionTypeCodegenPolicy,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from tests.helpers.project_state_sections import create_top_level_section


class TestDrawDependencyGraph:
    def test_draw_section_file_path_exports_literal_path(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Draw,
            Position(),
        )
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            DrawSectionImplArgsWithCallable(renderedImagePath="artifacts/draw.png"),
        )
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Draw] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.file_path,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        assert isinstance(node, SectionNode)
        assert isinstance(node.value, LiteralDependencyValue)
        assert node.value is not None
        assert node.value.payload == "artifacts/draw.png"

    def test_draw_section_file_read_exports_file_value(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Draw,
            Position(),
        )
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            DrawSectionImplArgsWithCallable(renderedImagePath="artifacts/draw.png"),
        )
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Draw] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.file_read,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        assert isinstance(node, SectionNode)
        assert isinstance(node.value, FileReadDependencyValue)
        assert node.value is not None
        assert node.value.payload == "artifacts/draw.png"

    def test_draw_section_file_read_falls_back_without_rendered_path(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Draw,
            Position(),
        )
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Draw] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.file_read,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        assert isinstance(node, SectionNode)
        assert node.representation == SectionRepresentationMode.expression
        assert isinstance(node.value, LiteralDependencyValue)
        assert node.value is not None
        assert node.value.payload == "None"

    def test_draw_section_file_path_falls_back_without_rendered_path(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Draw,
            Position(),
        )
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Draw] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.file_path,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        assert isinstance(node, SectionNode)
        assert node.representation == SectionRepresentationMode.expression
        assert isinstance(node.value, LiteralDependencyValue)
        assert node.value is not None
        assert node.value.payload == "None"
