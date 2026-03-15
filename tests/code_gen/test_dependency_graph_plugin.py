from setta.code_gen.dependency_graph import DependencyGraph, SectionNode
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import set_curr_effective_section_impl_value
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from tests.helpers.project_state_sections import create_top_level_section


class TestPluginDependencyGraph:
    def test_plugin_section_exports_sorted_python_literal_payload(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Plugin,
            Position(),
        )
        plugin_data = {
            "zeta": 1,
            "alpha": "ok",
        }
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            {
                "data": plugin_data,
            },
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        assert isinstance(node, SectionNode)
        assert isinstance(node.value, LiteralDependencyValue)
        assert node.value is not None
        assert node.value.payload == "{'alpha': 'ok', 'zeta': 1}"

    def test_plugin_section_is_registered_in_dependency_name_lookup(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Plugin,
            Position(),
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        assert dep_key in graph.full_path_name_to_dep_key.values()
