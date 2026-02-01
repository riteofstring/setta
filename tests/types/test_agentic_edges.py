import pytest

from setta.database.utils import create_new_id
from setta.types.agentic_edges import AgenticEdge, AgenticEdgeKind
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_agentic_edge,
    create_top_level_section,
    delete_agentic_edges,
    set_agentic_edges,
    update_agentic_edge,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


class TestAgenticEdges:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="agentic-edge-test")
        )
        self.chat_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(),
        )
        self.other_chat_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(),
        )
        self.context_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )

    def _create_edge(
        self, source_section_id: str, target_section_id: str, kind: AgenticEdgeKind
    ) -> AgenticEdge:
        edge = AgenticEdge(
            id=create_new_id(),
            sourceSectionId=source_section_id,
            targetSectionId=target_section_id,
            kind=kind,
        )
        create_agentic_edge(self.project_state, edge)
        return edge

    def test_create_and_update_agentic_edge(self) -> None:
        edge = self._create_edge(
            self.context_section_id,
            self.chat_section_id,
            AgenticEdgeKind.section_chat,
        )
        assert len(self.project_state.projectConfig.agenticEdges) == 1

        updated = edge.model_copy(update={"hidden": True, "zIndex": 3}, deep=True)
        update_agentic_edge(self.project_state, updated)

        stored = self.project_state.projectConfig.agenticEdges[0]
        assert stored.hidden is True
        assert stored.zIndex == 3

    def test_delete_agentic_edges(self) -> None:
        first = self._create_edge(
            self.context_section_id,
            self.chat_section_id,
            AgenticEdgeKind.section_chat,
        )
        second = self._create_edge(
            self.chat_section_id,
            self.other_chat_id,
            AgenticEdgeKind.chat_chat,
        )

        delete_agentic_edges(self.project_state, [first.id])

        remaining = self.project_state.projectConfig.agenticEdges
        assert remaining == [second]

    def test_set_agentic_edges_replaces(self) -> None:
        edge = AgenticEdge(
            sourceSectionId=self.chat_section_id,
            targetSectionId=self.context_section_id,
            kind=AgenticEdgeKind.chat_section,
        )
        set_agentic_edges(self.project_state, [edge])

        assert self.project_state.projectConfig.agenticEdges == [edge]

    def test_agentic_edge_kind_requires_chat_target(self) -> None:
        edge = AgenticEdge(
            sourceSectionId=self.context_section_id,
            targetSectionId=self.context_section_id,
            kind=AgenticEdgeKind.section_chat,
        )
        with pytest.raises(TypeError):
            create_agentic_edge(self.project_state, edge)

    def test_agentic_edge_requires_existing_source(self) -> None:
        edge = AgenticEdge(
            sourceSectionId="missing-section",
            targetSectionId=self.chat_section_id,
            kind=AgenticEdgeKind.section_chat,
        )
        with pytest.raises(KeyError):
            create_agentic_edge(self.project_state, edge)

    def test_agentic_edge_requires_existing_target(self) -> None:
        edge = AgenticEdge(
            sourceSectionId=self.context_section_id,
            targetSectionId="missing-section",
            kind=AgenticEdgeKind.section_chat,
        )
        with pytest.raises(KeyError):
            create_agentic_edge(self.project_state, edge)

    def test_project_config_round_trip(self) -> None:
        edge = AgenticEdge(
            sourceSectionId=self.context_section_id,
            targetSectionId=self.chat_section_id,
            kind=AgenticEdgeKind.section_chat,
        )
        config = ProjectConfig(name="round-trip", agenticEdges=[edge])
        payload = config.model_dump(mode="json")
        restored = ProjectConfig.model_validate(payload)

        assert restored.agenticEdges == [edge]
