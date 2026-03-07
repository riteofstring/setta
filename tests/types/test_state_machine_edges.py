import pytest

from setta.database.utils import create_new_id
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_state_machine_edge,
    create_top_level_section,
    delete_state_machine_edges,
    set_state_machine_edges,
    update_state_machine_edge,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.types.state_machine_edges import StateMachineEdge


class TestStateMachineEdges:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="state-machine-edge-test")
        )
        self.start_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.StateMachineStart,
            Position(),
        )
        self.gate_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.StateMachineGate,
            Position(x=240, y=0),
        )
        self.end_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.StateMachineEnd,
            Position(x=480, y=0),
        )

        start_impl = self.project_state.sections[self.start_section_id]
        gate_impl = self.project_state.sections[self.gate_section_id]
        end_impl = self.project_state.sections[self.end_section_id]
        # Keep the same machine group across fixtures to validate happy-path CRUD.
        shared_machine_group_id = "workflow-main"
        self.project_state.sections[start_impl.id].sharedModifier["machineGroupId"] = (
            shared_machine_group_id
        )
        self.project_state.sections[gate_impl.id].sharedModifier["machineGroupId"] = (
            shared_machine_group_id
        )
        self.project_state.sections[end_impl.id].sharedModifier["machineGroupId"] = (
            shared_machine_group_id
        )
        self.machine_group_id = shared_machine_group_id

    def _create_edge(
        self,
        source_section_id: str,
        source_port_id: str,
        target_section_id: str,
        target_port_id: str,
    ) -> StateMachineEdge:
        edge = StateMachineEdge(
            id=create_new_id(),
            machineGroupId=self.machine_group_id,
            sourceSectionId=source_section_id,
            sourcePortId=source_port_id,
            targetSectionId=target_section_id,
            targetPortId=target_port_id,
        )
        create_state_machine_edge(self.project_state, edge)
        return edge

    def test_create_and_update_state_machine_edge(self) -> None:
        edge = self._create_edge(
            self.start_section_id,
            "start",
            self.gate_section_id,
            "gate_input",
        )
        assert len(self.project_state.projectConfig.stateMachineEdges) == 1

        updated = edge.model_copy(update={"hidden": True, "zIndex": 3}, deep=True)
        update_state_machine_edge(self.project_state, updated)

        stored = self.project_state.projectConfig.stateMachineEdges[0]
        assert stored.hidden is True
        assert stored.zIndex == 3

    def test_delete_state_machine_edges(self) -> None:
        first = self._create_edge(
            self.start_section_id,
            "start",
            self.gate_section_id,
            "gate_input",
        )
        second = self._create_edge(
            self.gate_section_id,
            "gate_output",
            self.end_section_id,
            "end",
        )

        delete_state_machine_edges(self.project_state, [first.id])

        remaining = self.project_state.projectConfig.stateMachineEdges
        assert remaining == [second]

    def test_set_state_machine_edges_replaces(self) -> None:
        edge = StateMachineEdge(
            machineGroupId=self.machine_group_id,
            sourceSectionId=self.gate_section_id,
            sourcePortId="gate_output",
            targetSectionId=self.end_section_id,
            targetPortId="end",
        )
        set_state_machine_edges(self.project_state, [edge])

        assert self.project_state.projectConfig.stateMachineEdges == [edge]

    def test_state_machine_edge_requires_existing_source(self) -> None:
        edge = StateMachineEdge(
            machineGroupId=self.machine_group_id,
            sourceSectionId="missing-section",
            sourcePortId="start",
            targetSectionId=self.end_section_id,
            targetPortId="end",
        )
        with pytest.raises(KeyError):
            create_state_machine_edge(self.project_state, edge)

    def test_state_machine_edge_requires_matching_machine_group(self) -> None:
        edge = StateMachineEdge(
            machineGroupId="other-machine",
            sourceSectionId=self.start_section_id,
            sourcePortId="start",
            targetSectionId=self.end_section_id,
            targetPortId="end",
        )
        with pytest.raises(ValueError):
            create_state_machine_edge(self.project_state, edge)

    def test_project_config_round_trip(self) -> None:
        edge = StateMachineEdge(
            machineGroupId=self.machine_group_id,
            sourceSectionId=self.start_section_id,
            sourcePortId="start",
            targetSectionId=self.end_section_id,
            targetPortId="end",
        )
        config = ProjectConfig(name="round-trip", stateMachineEdges=[edge])
        payload = config.model_dump(mode="json")
        restored = ProjectConfig.model_validate(payload)

        assert restored.stateMachineEdges == [edge]
