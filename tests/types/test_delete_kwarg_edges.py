import pytest
from setta.types.code_obj_impls import CodeParamCodeObjImpl
from setta.types.edges import Edge
from tests.helpers.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
    get_curr_section_variant,
)
from tests.helpers.project_state_mutations import (
    add_kwarg,
    delete_kwarg,
    set_param_entered_value,
    set_section_edge_inputs,
)
from setta.types.id import create_new_id
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import BaseDictSectionImpl, SectionType
from tests.helpers.project_state_sections import create_top_level_section


class TestDeleteKwargEdges:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="delete-kwarg-edges-test")
        )

    def test_delete_kwarg_removes_edge_inputs_and_clears_value(self) -> None:
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
        edge = Edge(
            sourceSectionId=source_section_id,
            sourceVariantId=get_curr_section_variant(
                self.project_state, source_section_id
            ).id,
            sourcePortId=create_new_id(),
            targetSectionId=target_section_id,
            targetVariantId=get_curr_section_variant(
                self.project_state, target_section_id
            ).id,
            targetPortId=target_param_id,
        )
        self.project_state.projectConfig.edges = [edge]
        set_param_entered_value(
            self.project_state, target_section_id, target_param_id, "connected"
        )

        delete_kwarg(self.settings, self.project_state, target_section_id)

        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state, target_section_id, BaseDictSectionImpl
        )
        assert target_param_id not in section_impl.edgeInputParams
        assert self.project_state.projectConfig.edges == []
        param_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            target_section_id,
            target_param_id,
            CodeParamCodeObjImpl,
        )
        assert param_impl.value == ""
