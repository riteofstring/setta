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
    ProjectCodegenPythonTarget,
    ProjectConfig,
    SectionCodegenPolicy,
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
            representation=CodeObjValueRepresentationMode.string
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        self.assertIsInstance(node, SectionNode)
        self.assertEqual(
            node.control_value_representation,
            CodeObjValueRepresentationMode.string,
        )

    def test_meta_control_allowlist_filters_by_control_type(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(
                name="test-project",
                codegenTargets=[
                    ProjectCodegenPythonTarget(
                        sectionPolicy=SectionCodegenPolicy(
                            metaControlAllowlist=[CodeObjType.TextParam]
                        )
                    )
                ],
            )
        )
        allowed_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.MetaControl,
            Position(),
            control_code_obj_type=CodeObjType.TextParam,
        )
        blocked_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.MetaControl,
            Position(),
            control_code_obj_type=CodeObjType.SliderParam,
        )

        graph = DependencyGraph(project_state)
        allowed_node = graph.graph[create_dep_key(sectionId=allowed_section_id)]
        blocked_node = graph.graph[create_dep_key(sectionId=blocked_section_id)]
        self.assertTrue(allowed_node.include_in_codegen)
        self.assertFalse(blocked_node.include_in_codegen)

    def test_meta_control_supports_rotary_and_text_area(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        rotary_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.MetaControl,
            Position(),
            control_code_obj_type=CodeObjType.RotaryParam,
        )
        text_area_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.MetaControl,
            Position(),
            control_code_obj_type=CodeObjType.TextAreaParam,
        )

        graph = DependencyGraph(project_state)
        rotary_node = graph.graph[create_dep_key(sectionId=rotary_section_id)]
        text_area_node = graph.graph[create_dep_key(sectionId=text_area_section_id)]
        self.assertEqual(rotary_node.control_code_obj_type, CodeObjType.RotaryParam)
        self.assertTrue(rotary_node.include_in_codegen)
        self.assertEqual(
            text_area_node.control_code_obj_type, CodeObjType.TextAreaParam
        )
        self.assertTrue(text_area_node.include_in_codegen)
