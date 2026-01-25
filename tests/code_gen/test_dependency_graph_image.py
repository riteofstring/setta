from unittest import TestCase

from setta.code_gen.dependency_graph import DependencyGraph, SectionNode
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import FileReadDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    set_image_area_image_path,
)
from setta.types.project_config import (
    Position,
    ProjectConfig,
    SectionCodegenMode,
    SectionRepresentationMode,
    SectionTypeCodegenPolicy,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


class ImageDependencyGraphTests(TestCase):
    def test_image_section_exports_file_value_when_enabled(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Image,
            Position(),
        )
        set_image_area_image_path(
            project_state,
            section_id,
            "artifacts/reversed_image.png",
        )
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Image] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.file,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        self.assertIsInstance(node, SectionNode)
        self.assertTrue(node.include_in_codegen)
        self.assertIsInstance(node.value, FileReadDependencyValue)
        assert node.value is not None
        self.assertEqual(node.value.payload, "artifacts/reversed_image.png")

    def test_image_section_rejects_json_representation(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Image,
            Position(),
        )
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Image] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.json,
        )

        with self.assertRaises(ValueError):
            DependencyGraph(project_state)
