from pathlib import Path

import pytest

from setta.code_gen.dependency_graph import DependencyGraph, SectionNode
from setta.database.db_objs import DBE
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    set_prompt_section_template_link,
)
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.prompt import PromptTemplate
from setta.types.section_impls import SectionType


class TestPromptDependencyGraph:
    def test_prompt_section_uses_live_linked_template_text(
        self, tmp_path: Path
    ) -> None:
        # Codegen should follow the linked prompt template id instead of exporting
        # a stale template snapshot stored on the prompt section itself.
        dbe = DBE(tmp_path / "setta_files")
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Prompt,
            Position(),
        )
        prompt_template = PromptTemplate(
            id=ID("prompt-template-graph"),
            name="Greeting",
            template="Hello from the saved template.",
        )
        dbe.write_prompt(prompt_template.id, prompt_template.model_dump(mode="json"))
        set_prompt_section_template_link(
            project_state,
            section_id,
            prompt_template.id,
            "stale prompt snapshot",
            prompt_template.format,
        )
        updated_template = PromptTemplate(
            id=prompt_template.id,
            name=prompt_template.name,
            template="Hello from the updated saved template.",
            format=prompt_template.format,
        )
        dbe.write_prompt(updated_template.id, updated_template.model_dump(mode="json"))

        graph = DependencyGraph(project_state, dbe=dbe)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]

        assert isinstance(node, SectionNode)
        assert isinstance(node.value, LiteralDependencyValue)
        assert node.value.payload == "Hello from the updated saved template."

    def test_prompt_section_raises_when_linked_template_is_missing(
        self, tmp_path: Path
    ) -> None:
        dbe = DBE(tmp_path / "setta_files")
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Prompt,
            Position(),
        )
        prompt_template = PromptTemplate(
            id=ID("prompt-template-missing"),
            name="Greeting",
            template="Hello from the saved template.",
        )
        dbe.write_prompt(prompt_template.id, prompt_template.model_dump(mode="json"))
        set_prompt_section_template_link(
            project_state,
            section_id,
            prompt_template.id,
            "stale prompt snapshot",
            prompt_template.format,
        )
        dbe.delete_prompt_file(prompt_template.id)

        with pytest.raises(KeyError, match=str(prompt_template.id)):
            DependencyGraph(project_state, dbe=dbe)
