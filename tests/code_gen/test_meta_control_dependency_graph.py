from unittest import TestCase

from setta.code_gen.dependency_graph import DependencyGraph, SectionNode
from setta.types.code_obj_impls import CodeObjType
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    get_meta_control_param_id,
    set_param_entered_value,
)
from setta.types.project_config import (
    CodeObjValueOverride,
    CodeObjValueRepresentationMode,
    Position,
    ProjectConfig,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


class MetaControlDependencyGraphTests(TestCase):
    def test_meta_control_exports_control_param_value(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.MetaControl,
            Position(),
            control_code_obj_type=CodeObjType.TextParam,
        )
        control_param_id = get_meta_control_param_id(project_state, section_id)
        set_param_entered_value(project_state, section_id, control_param_id, "notes")

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        self.assertIsInstance(node, SectionNode)
        self.assertIsInstance(node.value, LiteralDependencyValue)
        assert node.value is not None
        self.assertEqual(node.value.payload, "notes")
        self.assertEqual(node.control_code_obj_type, CodeObjType.TextParam)

    def test_meta_control_exports_control_value_representation(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.MetaControl,
            Position(),
            control_code_obj_type=CodeObjType.TextParam,
        )
        control_param_id = get_meta_control_param_id(project_state, section_id)
        set_param_entered_value(project_state, section_id, control_param_id, "notes")
        code_obj_policy = project_state.projectConfig.codegenTargets[
            0
        ].codeObjValuePolicy
        code_obj_policy.codeObjOverrides[control_param_id] = CodeObjValueOverride(
            representation=CodeObjValueRepresentationMode.raw
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        self.assertIsInstance(node, SectionNode)
        self.assertEqual(node.control_code_obj_id, control_param_id)
        self.assertEqual(
            node.control_value_representation,
            CodeObjValueRepresentationMode.raw,
        )
