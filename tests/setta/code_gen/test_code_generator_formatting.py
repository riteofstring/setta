from unittest import TestCase

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.code_generator import PythonCodeGenerator
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_top_level_section,
    set_param_entered_value,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


class CodeGeneratorFormattingTests(TestCase):
    def test_dict_section_renders_multiline_values(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Dict,
            Position(),
            core_overrides={"name": "config"},
        )

        param_ids = []
        for idx in range(4):
            param_id = add_kwarg(settings, project_state, section_id)
            project_state.codeObjs[param_id].name = f"param_{idx}"
            set_param_entered_value(project_state, section_id, param_id, str(idx))
            param_ids.append(param_id)

        dep_graph = DependencyGraph(project_state)
        generator = PythonCodeGenerator(
            dep_graph,
            project_state.projectConfig.genCodePrefix,
            project_state.projectConfig.genCodeSuffix,
        )
        generator.generate_code()
        generated_lines = generator.generated_code.splitlines()

        target_index = None
        target_line = ""
        for idx, line in enumerate(generated_lines):
            if "state.config = {" in line:
                target_index = idx
                target_line = line
                break

        self.assertIsNotNone(target_index)
        assert target_index is not None
        self.assertTrue(target_line.startswith("        state.config = {"))

        expected_block_len = target_index + 1 + len(param_ids) + 1
        self.assertGreaterEqual(len(generated_lines), expected_block_len)

        item_lines = generated_lines[target_index + 1 : target_index + 1 + len(param_ids)]
        for idx, line in enumerate(item_lines):
            self.assertTrue(line.startswith("            "))
            self.assertIn(
                f"\"param_{idx}\": state.config__param_{idx},",
                line,
            )

        closing_line = generated_lines[target_index + 1 + len(param_ids)]
        self.assertEqual(closing_line, "        }")
