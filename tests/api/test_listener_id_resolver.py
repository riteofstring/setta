import pytest

from setta.api.listener import ListenerDependencyIds
from setta.sdk_contracts.generated import ListenerDependencyCatalogEntry
from setta.types.generated.go_shared_types import CodeObjType, SectionType
from setta.types.id import ID
from setta.types.protocol import create_dep_key
from tests.helpers.listener_runtime_state import (
    build_listener_runtime_state_from_entries,
)


def _build_runtime_state_with_duplicate_sections():
    group_id = ID("section-group")
    child_1_id = ID("section-child-1")
    child_2_id = ID("section-child-2")
    runtime_state = build_listener_runtime_state_from_entries(
        [
            ListenerDependencyCatalogEntry(
                dependencyKey=create_dep_key(sectionId=group_id),
                name="Settings Group",
                fullPathName="Settings_Group",
                sectionType="Group",
            ),
            ListenerDependencyCatalogEntry(
                dependencyKey=create_dep_key(sectionId=child_1_id),
                name="Item",
                fullPathName="Settings_Group__Item",
                sectionType="TextBlock",
            ),
            ListenerDependencyCatalogEntry(
                dependencyKey=create_dep_key(sectionId=child_2_id),
                name="Item",
                fullPathName="Settings_Group__Item_2",
                sectionType="TextBlock",
            ),
        ]
    )
    return runtime_state, {
        "group": group_id,
        "child_1": child_1_id,
        "child_2": child_2_id,
    }


def _build_runtime_state_with_params():
    section_id = ID("section-inputs")
    kwarg_id = ID("param-alpha")
    runtime_state = build_listener_runtime_state_from_entries(
        [
            ListenerDependencyCatalogEntry(
                dependencyKey=create_dep_key(sectionId=section_id),
                name="Inputs",
                fullPathName="Inputs",
                dependencies=[create_dep_key(sectionId=section_id, codeObjId=kwarg_id)],
                sectionType="Dict",
            ),
            ListenerDependencyCatalogEntry(
                dependencyKey=create_dep_key(sectionId=section_id, codeObjId=kwarg_id),
                name="alpha",
                fullPathName="Inputs.alpha",
                codeObjType="CodeParam",
                valueRepresentation="expression",
            ),
        ]
    )
    return runtime_state, section_id, kwarg_id


class TestListenerDependencyIds:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        runtime_state, ids = _build_runtime_state_with_duplicate_sections()
        self.ids_helper = ListenerDependencyIds(runtime_state.dependency_metadata)
        self.ids = ids

    def test_dependency_name_resolves_section(self) -> None:
        resolved = self.ids_helper.section_id("Settings_Group__Item_2")
        assert resolved == self.ids["child_2"]

    def test_resolve_payload_maps_section_dependencies(self) -> None:
        resolved = self.ids_helper.section_ids(
            ["Settings_Group", "Settings_Group__Item_2"]
        )
        assert resolved == [self.ids["group"], self.ids["child_2"]]

    def test_resolve_payload_maps_param_dependency(self) -> None:
        runtime_state, section_id, kwarg_id = _build_runtime_state_with_params()
        ids_helper = ListenerDependencyIds(runtime_state.dependency_metadata)
        param_ids = ids_helper.param_ids("Inputs.alpha")
        assert param_ids.sectionId == section_id
        assert param_ids.paramInfoId == kwarg_id

    def test_meta_control_param_ids_resolve_from_dependency_metadata(self) -> None:
        section_id = ID("section-meta")
        control_param_id = ID("control-param")
        runtime_state = build_listener_runtime_state_from_entries(
            [
                ListenerDependencyCatalogEntry(
                    dependencyKey=create_dep_key(sectionId=section_id),
                    name="Meta Control",
                    fullPathName="Meta_Control",
                    sectionType=SectionType.MetaControl,
                    controlCodeObjId=control_param_id,
                    controlCodeObjType=CodeObjType.TextParam,
                )
            ]
        )
        ids_helper = ListenerDependencyIds(runtime_state.dependency_metadata)

        param_ids = ids_helper.meta_control_param_ids("Meta_Control")

        assert param_ids.sectionId == section_id
        assert param_ids.paramInfoId == control_param_id
