import pytest

from setta.database.utils import create_new_id
from setta.types.code_obj_impls import CodeParamCodeObjImpl
from setta.types.edges import Edge, EdgePort
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_section_variant,
)
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_edge,
    create_top_level_section,
    delete_edges,
    set_edges,
    set_param_entered_value,
    set_section_edge_inputs,
    set_section_edge_outputs,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


class TestEdgeCleanup:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="edge-cleanup-test")
        )

    def _create_dict_section(self) -> str:
        return create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )

    def _create_dict_section_with_kwarg(self) -> tuple[str, str]:
        section_id = self._create_dict_section()
        kwarg_id = add_kwarg(self.settings, self.project_state, section_id)
        return section_id, kwarg_id

    def _set_output_ports(self, section_id: str, count: int) -> list[str]:
        ports = [
            EdgePort(id=create_new_id(), accessor="") for _ in range(count)
        ]
        set_section_edge_outputs(self.project_state, section_id, ports)
        return [port.id for port in ports]

    def _create_edge(
        self,
        source_section_id: str,
        source_port_id: str,
        target_section_id: str,
        target_port_id: str,
    ) -> Edge:
        edge = Edge(
            sourceSectionId=source_section_id,
            sourceVariantId=get_curr_section_variant(
                self.project_state, source_section_id
            ).id,
            sourcePortId=source_port_id,
            targetSectionId=target_section_id,
            targetVariantId=get_curr_section_variant(
                self.project_state, target_section_id
            ).id,
            targetPortId=target_port_id,
        )
        create_edge(self.project_state, edge)
        return edge

    def test_delete_edges_clears_target_value(self) -> None:
        source_section_id = self._create_dict_section()
        target_section_id, target_param_id = self._create_dict_section_with_kwarg()
        set_section_edge_inputs(
            self.settings,
            self.project_state,
            target_section_id,
            [target_param_id],
        )
        output_port_id = self._set_output_ports(source_section_id, 1)[0]
        edge = self._create_edge(
            source_section_id,
            output_port_id,
            target_section_id,
            target_param_id,
        )
        set_param_entered_value(
            self.project_state, target_section_id, target_param_id, "connected"
        )

        delete_edges(self.project_state, [edge.id])

        target_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            target_section_id,
            target_param_id,
            CodeParamCodeObjImpl,
        )
        assert target_impl.value == ""

    def test_delete_edges_keeps_value_when_edge_remains(self) -> None:
        source_section_id = self._create_dict_section()
        target_section_id, target_param_id = self._create_dict_section_with_kwarg()
        set_section_edge_inputs(
            self.settings,
            self.project_state,
            target_section_id,
            [target_param_id],
        )
        output_port_ids = self._set_output_ports(source_section_id, 2)
        first_edge = self._create_edge(
            source_section_id,
            output_port_ids[0],
            target_section_id,
            target_param_id,
        )
        self._create_edge(
            source_section_id,
            output_port_ids[1],
            target_section_id,
            target_param_id,
        )
        set_param_entered_value(
            self.project_state, target_section_id, target_param_id, "connected"
        )

        delete_edges(self.project_state, [first_edge.id])

        target_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            target_section_id,
            target_param_id,
            CodeParamCodeObjImpl,
        )
        assert target_impl.value == "connected"
        assert len(self.project_state.projectConfig.edges) == 1

    def test_set_edges_clears_removed_targets(self) -> None:
        source_section_id = self._create_dict_section()
        target_section_id, target_param_id = self._create_dict_section_with_kwarg()
        set_section_edge_inputs(
            self.settings,
            self.project_state,
            target_section_id,
            [target_param_id],
        )
        output_port_id = self._set_output_ports(source_section_id, 1)[0]
        self._create_edge(
            source_section_id,
            output_port_id,
            target_section_id,
            target_param_id,
        )
        set_param_entered_value(
            self.project_state, target_section_id, target_param_id, "connected"
        )

        set_edges(self.project_state, [])

        target_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            target_section_id,
            target_param_id,
            CodeParamCodeObjImpl,
        )
        assert target_impl.value == ""
        assert self.project_state.projectConfig.edges == []
