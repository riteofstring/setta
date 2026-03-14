import pytest

from setta.database.utils import create_new_id
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_state_machine_edge,
    create_top_level_section,
    delete_state_machine_edges,
    set_prompt_section_template,
    set_state_machine_section_settings,
    set_state_machine_edges,
    update_state_machine_edge,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType, StateMachineGateType
from setta.types.state_machine_edges import (
    STATE_MACHINE_EDGE_SOURCE_PORT_ID,
    STATE_MACHINE_EDGE_TARGET_PORT_ID,
    StateMachineEdge,
    StateMachineSourceFilter,
    StateMachineSourceFilterType,
    StateMachineTargetAction,
    StateMachineTargetActionType,
)


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
        target_section_id: str,
        *,
        source_filter: StateMachineSourceFilter | None = None,
        target_action: StateMachineTargetAction | None = None,
    ) -> StateMachineEdge:
        edge = StateMachineEdge(
            id=create_new_id(),
            machineGroupId=self.machine_group_id,
            sourceSectionId=source_section_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=target_section_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            sourceFilter=source_filter,
            targetAction=target_action,
        )
        create_state_machine_edge(self.project_state, edge)
        return edge

    def test_create_and_update_state_machine_edge(self) -> None:
        edge = self._create_edge(self.start_section_id, self.gate_section_id)
        assert len(self.project_state.projectConfig.stateMachineEdges) == 1

        updated = edge.model_copy(update={"hidden": True, "zIndex": 3}, deep=True)
        update_state_machine_edge(self.project_state, updated)

        stored = self.project_state.projectConfig.stateMachineEdges[0]
        assert stored.hidden is True
        assert stored.zIndex == 3

    def test_delete_state_machine_edges(self) -> None:
        first = self._create_edge(self.start_section_id, self.gate_section_id)
        second = self._create_edge(self.gate_section_id, self.end_section_id)

        delete_state_machine_edges(self.project_state, [first.id])

        remaining = self.project_state.projectConfig.stateMachineEdges
        assert remaining == [second]

    def test_set_state_machine_edges_replaces(self) -> None:
        edge = StateMachineEdge(
            machineGroupId=self.machine_group_id,
            sourceSectionId=self.gate_section_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=self.end_section_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
        set_state_machine_edges(self.project_state, [edge])

        assert self.project_state.projectConfig.stateMachineEdges == [edge]

    def test_state_machine_edge_requires_existing_source(self) -> None:
        edge = StateMachineEdge(
            machineGroupId=self.machine_group_id,
            sourceSectionId="missing-section",
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=self.end_section_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
        with pytest.raises(KeyError):
            create_state_machine_edge(self.project_state, edge)

    def test_state_machine_edge_requires_matching_machine_group(self) -> None:
        edge = StateMachineEdge(
            machineGroupId="other-machine",
            sourceSectionId=self.start_section_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=self.end_section_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
        with pytest.raises(ValueError):
            create_state_machine_edge(self.project_state, edge)

    def test_connected_machine_groups_can_remain_incomplete_while_editing(self) -> None:
        # Draft workflows can temporarily have incomplete Start/End coverage while
        # users lay out the machine on canvas.
        extra_start_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.StateMachineStart,
            Position(x=720, y=0),
        )
        self.project_state.sections[extra_start_id].sharedModifier["machineGroupId"] = (
            self.machine_group_id
        )
        edge = StateMachineEdge(
            machineGroupId=self.machine_group_id,
            sourceSectionId=self.start_section_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=self.end_section_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
        create_state_machine_edge(self.project_state, edge)
        assert self.project_state.projectConfig.stateMachineEdges == [edge]

        delete_state_machine_edges(self.project_state, [edge.id])
        assert self.project_state.projectConfig.stateMachineEdges == []

        self.project_state.sections[extra_start_id].sharedModifier["machineGroupId"] = (
            "other-machine"
        )
        self.project_state.sections[self.end_section_id].sharedModifier[
            "machineGroupId"
        ] = "other-machine"
        second_edge = self._create_edge(self.start_section_id, self.gate_section_id)
        assert self.project_state.projectConfig.stateMachineEdges == [second_edge]

    def test_create_state_machine_edge_merges_connected_machine_groups(self) -> None:
        other_machine_group_id = "other-machine"
        extra_start_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.StateMachineStart,
            Position(x=720, y=0),
        )
        self.project_state.sections[extra_start_id].sharedModifier["machineGroupId"] = (
            other_machine_group_id
        )
        self.project_state.sections[self.end_section_id].sharedModifier[
            "machineGroupId"
        ] = other_machine_group_id
        existing_edge = StateMachineEdge(
            id=create_new_id(),
            machineGroupId=other_machine_group_id,
            sourceSectionId=extra_start_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=self.end_section_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
            sourceFilter=None,
            targetAction=None,
        )
        create_state_machine_edge(self.project_state, existing_edge)

        merged_edge = self._create_edge(self.gate_section_id, self.end_section_id)

        assert [
            edge.machineGroupId
            for edge in self.project_state.projectConfig.stateMachineEdges
        ] == [
            self.machine_group_id,
            self.machine_group_id,
        ]
        assert (
            self.project_state.sections[self.end_section_id].sharedModifier[
                "machineGroupId"
            ]
            == self.machine_group_id
        )
        assert merged_edge.machineGroupId == self.machine_group_id

    def test_chat_target_requires_valid_action(self) -> None:
        chat_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(x=720, y=0),
        )
        with pytest.raises(ValueError, match="requires a target action"):
            self._create_edge(self.start_section_id, chat_section_id)

        edge = self._create_edge(
            self.start_section_id,
            chat_section_id,
            target_action=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                inlinePrompt="Review this branch",
            ),
        )
        assert edge.targetAction is not None
        assert edge.targetAction.type == StateMachineTargetActionType.send_prompt

    def test_chat_target_rejects_invalid_send_prompt_spec(self) -> None:
        chat_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(x=720, y=0),
        )
        with pytest.raises(
            ValueError,
            match="exactly one of promptTemplateId, promptSectionId, or inlinePrompt",
        ):
            self._create_edge(
                self.start_section_id,
                chat_section_id,
                target_action=StateMachineTargetAction(
                    type=StateMachineTargetActionType.send_prompt,
                    promptTemplateId=create_new_id(),
                    inlinePrompt="Both sources set",
                ),
            )

        with pytest.raises(ValueError, match="cannot include prompt content"):
            self._create_edge(
                self.start_section_id,
                chat_section_id,
                target_action=StateMachineTargetAction(
                    type=StateMachineTargetActionType.reset_thread,
                    inlinePrompt="not allowed",
                ),
            )

    def test_chat_target_accepts_prompt_section_with_bound_inputs(self) -> None:
        chat_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(x=720, y=0),
        )
        prompt_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Prompt,
            Position(x=360, y=160),
        )
        set_prompt_section_template(
            self.project_state,
            prompt_section_id,
            "Hi my name is {{ name }}. What's your name?",
        )

        edge = self._create_edge(
            self.start_section_id,
            chat_section_id,
            target_action=StateMachineTargetAction(
                type=StateMachineTargetActionType.send_prompt,
                promptSectionId=prompt_section_id,
                promptInputs={"name": "Kevin"},
            ),
        )
        assert edge.targetAction is not None
        assert edge.targetAction.promptSectionId == prompt_section_id
        assert edge.targetAction.promptInputs == {"name": "Kevin"}

    def test_chat_target_rejects_prompt_section_with_missing_bindings(self) -> None:
        chat_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(x=720, y=0),
        )
        prompt_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Prompt,
            Position(x=360, y=160),
        )
        set_prompt_section_template(
            self.project_state,
            prompt_section_id,
            "Hi my name is {{ name }}. What's your name?",
        )

        with pytest.raises(
            ValueError, match="failed to render: Missing variables: name"
        ):
            self._create_edge(
                self.start_section_id,
                chat_section_id,
                target_action=StateMachineTargetAction(
                    type=StateMachineTargetActionType.send_prompt,
                    promptSectionId=prompt_section_id,
                ),
            )

    def test_chat_source_filters_are_restricted_to_chat_and_signal_fields(self) -> None:
        chat_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(x=720, y=0),
        )
        edge = self._create_edge(
            chat_section_id,
            self.end_section_id,
            source_filter=StateMachineSourceFilter(
                type=StateMachineSourceFilterType.signal,
                signalName="merge_decision",
                payloadField="decision",
                equals="retry",
            ),
        )
        assert edge.sourceFilter is not None
        assert edge.sourceFilter.type == StateMachineSourceFilterType.signal

        with pytest.raises(
            ValueError, match="only allows source filters on Chat sources"
        ):
            self._create_edge(
                self.start_section_id,
                self.end_section_id,
                source_filter=StateMachineSourceFilter(
                    type=StateMachineSourceFilterType.run_completed,
                ),
            )

        with pytest.raises(
            ValueError, match="require payloadField and equals together"
        ):
            self._create_edge(
                chat_section_id,
                self.end_section_id,
                source_filter=StateMachineSourceFilter(
                    type=StateMachineSourceFilterType.signal,
                    signalName="merge_decision",
                    payloadField="decision",
                ),
            )

    def test_section_settings_allow_draft_structure_changes_but_reject_edge_group_mismatches(
        self,
    ) -> None:
        self._create_edge(self.start_section_id, self.end_section_id)

        with pytest.raises(ValueError, match="does not match the source section"):
            set_state_machine_section_settings(
                self.project_state,
                self.start_section_id,
                "other-machine",
                "Start",
                None,
                None,
            )

        extra_start_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.StateMachineStart,
            Position(x=720, y=0),
        )
        set_state_machine_section_settings(
            self.project_state,
            extra_start_id,
            self.machine_group_id,
            "Extra Start",
            None,
            None,
        )
        extra_start_impl = self.project_state.sections[extra_start_id]
        assert (
            extra_start_impl.sharedModifier["machineGroupId"] == self.machine_group_id
        )

        # Label-only updates still succeed when the machine group remains valid.
        set_state_machine_section_settings(
            self.project_state,
            self.gate_section_id,
            self.machine_group_id,
            "Gate Label",
            StateMachineGateType.AND,
            None,
        )

    def test_project_config_round_trip(self) -> None:
        edge = StateMachineEdge(
            machineGroupId=self.machine_group_id,
            sourceSectionId=self.start_section_id,
            sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
            targetSectionId=self.end_section_id,
            targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
        )
        config = ProjectConfig(name="round-trip", stateMachineEdges=[edge])
        payload = config.model_dump(mode="json")
        restored = ProjectConfig.model_validate(payload)

        assert restored.stateMachineEdges == [edge]
