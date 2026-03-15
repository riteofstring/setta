import pytest

from setta.database.utils import create_new_id
from setta.types.edges import Edge, EdgePort
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_section_variant,
    get_variant_base_and_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_edge,
    create_new_section_variant,
    create_top_level_section,
    set_section_edge_inputs,
    set_section_edge_outputs,
)
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import BaseSectionWithParamsImpl, SectionType


class TestEdgePortVariants:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="edge-port-variant-test")
        )

    def _get_variant_impl(self, section_id: str, variant_id: str):
        core = self.project_state.sections[section_id]
        _, _, impl = get_variant_base_and_effective_section_impl_with_type_guard(
            self.project_state, core, variant_id, BaseSectionWithParamsImpl
        )
        return impl

    def test_edge_ports_are_variant_scoped(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        param_id = add_kwarg(self.settings, self.project_state, section_id)
        port_id = create_new_id()

        set_section_edge_inputs(
            self.settings, self.project_state, section_id, [param_id]
        )
        set_section_edge_outputs(
            self.project_state,
            section_id,
            [EdgePort(id=port_id, accessor="")],
        )

        original_variant_id = get_curr_section_variant(
            self.project_state, section_id
        ).id

        create_new_section_variant(self.project_state, section_id)
        new_variant_id = self.project_state.projectConfig.sectionVariantMap[section_id]

        assert original_variant_id != new_variant_id

        original_impl = self._get_variant_impl(section_id, original_variant_id)
        new_impl = self._get_variant_impl(section_id, new_variant_id)

        assert original_impl.edgeInputParams == new_impl.edgeInputParams
        assert [
            (port.id, port.accessor) for port in original_impl.edgeOutputPorts
        ] == [
            (port.id, port.accessor) for port in new_impl.edgeOutputPorts
        ]

        set_section_edge_inputs(self.settings, self.project_state, section_id, [])
        set_section_edge_outputs(
            self.project_state,
            section_id,
            [EdgePort(id=port_id, accessor=".bar")],
        )

        original_impl_after = self._get_variant_impl(section_id, original_variant_id)
        new_impl_after = self._get_variant_impl(section_id, new_variant_id)

        assert original_impl_after.edgeInputParams == [param_id]
        assert [
            (port.id, port.accessor)
            for port in original_impl_after.edgeOutputPorts
        ] == [(port_id, "")]
        assert new_impl_after.edgeInputParams == []
        assert [
            (port.id, port.accessor)
            for port in new_impl_after.edgeOutputPorts
        ] == [(port_id, ".bar")]

    def test_create_new_variant_copies_edges(self) -> None:
        source_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        target_section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        target_param_id = add_kwarg(
            self.settings, self.project_state, target_section_id
        )
        set_section_edge_inputs(
            self.settings,
            self.project_state,
            target_section_id,
            [target_param_id],
        )
        port_id = create_new_id()
        set_section_edge_outputs(
            self.project_state,
            source_section_id,
            [EdgePort(id=port_id, accessor="")],
        )

        original_edge = Edge(
            sourceSectionId=source_section_id,
            sourceVariantId=get_curr_section_variant(
                self.project_state, source_section_id
            ).id,
            sourcePortId=port_id,
            targetSectionId=target_section_id,
            targetVariantId=get_curr_section_variant(
                self.project_state, target_section_id
            ).id,
            targetPortId=target_param_id,
        )
        create_edge(self.project_state, original_edge)

        create_new_section_variant(self.project_state, source_section_id)
        new_variant_id = self.project_state.projectConfig.sectionVariantMap[
            source_section_id
        ]

        edges = self.project_state.projectConfig.edges
        assert len(edges) == 2
        new_edges = [
            edge
            for edge in edges
            if edge.sourceSectionId == source_section_id
            and edge.sourceVariantId == new_variant_id
        ]
        assert len(new_edges) == 1
        new_edge = new_edges[0]

        assert new_edge.id != original_edge.id
        assert new_edge.sourcePortId == original_edge.sourcePortId
        assert new_edge.targetSectionId == original_edge.targetSectionId
        assert new_edge.targetVariantId == original_edge.targetVariantId
        assert new_edge.targetPortId == original_edge.targetPortId
