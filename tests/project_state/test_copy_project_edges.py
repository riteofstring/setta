import pytest
from setta.database.utils import create_new_id
from setta.types.edges import Edge, EdgePort
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import get_curr_section_variant
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_edge,
    create_top_level_section,
    set_section_edge_inputs,
    set_section_edge_outputs,
)
from setta.types.helpers_lvl3 import copy_project
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


class TestCopyProjectEdge:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="copy-project-edge-test")
        )

    def test_copy_project_remaps_edge_references(self) -> None:
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
        output_port_id = create_new_id()
        set_section_edge_outputs(
            self.project_state,
            source_section_id,
            [EdgePort(id=output_port_id, accessor="")],
        )
        edge = Edge(
            sourceSectionId=source_section_id,
            sourceVariantId=get_curr_section_variant(
                self.project_state, source_section_id
            ).id,
            sourcePortId=output_port_id,
            targetSectionId=target_section_id,
            targetVariantId=get_curr_section_variant(
                self.project_state, target_section_id
            ).id,
            targetPortId=target_param_id,
        )
        create_edge(self.project_state, edge)

        copied = copy_project(self.project_state, "copy", do_create_new_id=True)

        old_section_ids = set(self.project_state.sections.keys())
        old_variant_ids = set(self.project_state.sectionVariants.keys())
        old_code_obj_ids = set(self.project_state.codeObjs.keys())
        new_section_ids = set(copied.sections.keys())
        new_variant_ids = set(copied.sectionVariants.keys())
        new_code_obj_ids = set(copied.codeObjs.keys())

        assert len(copied.projectConfig.edges) == 1
        copied_edge = copied.projectConfig.edges[0]
        assert copied_edge.sourceSectionId in new_section_ids
        assert copied_edge.targetSectionId in new_section_ids
        assert copied_edge.sourceSectionId not in old_section_ids
        assert copied_edge.targetSectionId not in old_section_ids
        assert copied_edge.sourceVariantId in new_variant_ids
        assert copied_edge.targetVariantId in new_variant_ids
        assert copied_edge.sourceVariantId not in old_variant_ids
        assert copied_edge.targetVariantId not in old_variant_ids
        assert copied_edge.targetPortId in new_code_obj_ids
        assert copied_edge.targetPortId not in old_code_obj_ids
