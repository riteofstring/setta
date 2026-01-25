import re
from uuid import UUID

import yaml
import pytest

from setta.project_state.readable_export import build_readable_project_export
from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    NestedParamCodeObjImpl,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.edges import Edge, EdgePort
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import CallableSectionImpl, CodeSectionImpl, DictSectionImpl


def _uuid_for_int(value: int) -> ID:
    return ID(str(UUID(int=value)))


def _build_backend() -> ProjectStateBackend:
    project_config_id = _uuid_for_int(1)
    source_section_id = _uuid_for_int(2)
    source_impl_id = _uuid_for_int(3)
    source_variant_id = _uuid_for_int(4)
    callable_core_id = _uuid_for_int(5)
    callable_impl_id = _uuid_for_int(6)
    callable_variant_id = _uuid_for_int(7)
    source_param_id = _uuid_for_int(8)
    source_param_impl_id = _uuid_for_int(9)
    source_param_variant_id = _uuid_for_int(10)
    edge_port_id = _uuid_for_int(11)
    target_section_id = _uuid_for_int(12)
    target_impl_id = _uuid_for_int(13)
    target_variant_id = _uuid_for_int(14)
    target_root_id = _uuid_for_int(15)
    target_root_impl_id = _uuid_for_int(16)
    target_root_variant_id = _uuid_for_int(17)
    target_param_id = _uuid_for_int(18)
    target_param_impl_id = _uuid_for_int(19)
    target_param_variant_id = _uuid_for_int(20)
    json_section_id = _uuid_for_int(21)
    json_impl_id = _uuid_for_int(22)
    json_variant_id = _uuid_for_int(23)
    code_section_id = _uuid_for_int(24)
    code_impl_id = _uuid_for_int(25)
    code_variant_id = _uuid_for_int(26)
    edge_id = _uuid_for_int(27)

    callable_impl = CodeCallableCodeObjImpl(
        id=callable_impl_id,
        children=[source_param_id],
    )
    callable_variant = Variant(
        id=callable_variant_id,
        name="Callable Variant",
        impl=callable_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
    )
    callable_core = Core(
        id=callable_core_id,
        name="MyFunc",
        variants=[callable_variant.id],
        defaultVariant=callable_variant.id,
    )

    source_param_impl = CodeParamCodeObjImpl(
        id=source_param_impl_id,
        value="1",
    )
    source_param_variant = Variant(
        id=source_param_variant_id,
        name="Source Param Variant",
        impl=source_param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(source_param_impl),
    )
    source_param_core = Core(
        id=source_param_id,
        name="input",
        variants=[source_param_variant.id],
        defaultVariant=source_param_variant.id,
    )

    source_impl = CallableSectionImpl(
        id=source_impl_id,
        callable=callable_core_id,
        codeObjVariantMap={
            callable_core_id: callable_variant.id,
            source_param_id: source_param_variant.id,
        },
        edgeOutputPorts=[EdgePort(id=edge_port_id, accessor=".result")],
    )
    source_variant = Variant(
        id=source_variant_id,
        name="Source Variant",
        impl=source_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(source_impl),
    )
    source_core = Core(
        id=source_section_id,
        name="Source",
        variants=[source_variant.id],
        defaultVariant=source_variant.id,
    )

    target_root_impl = NestedParamCodeObjImpl(
        id=target_root_impl_id,
        children=[target_param_id],
    )
    target_root_variant = Variant(
        id=target_root_variant_id,
        name="Target Root Variant",
        impl=target_root_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(target_root_impl),
    )
    target_root_core = Core(
        id=target_root_id,
        name="root",
        variants=[target_root_variant.id],
        defaultVariant=target_root_variant.id,
    )

    target_param_impl = CodeParamCodeObjImpl(
        id=target_param_impl_id,
        value="42",
    )
    target_param_variant = Variant(
        id=target_param_variant_id,
        name="Target Param Variant",
        impl=target_param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(target_param_impl),
    )
    target_param_core = Core(
        id=target_param_id,
        name="alpha",
        variants=[target_param_variant.id],
        defaultVariant=target_param_variant.id,
    )

    target_impl = DictSectionImpl(
        id=target_impl_id,
        topLevelParamId=target_root_id,
        codeObjVariantMap={
            target_root_id: target_root_variant.id,
            target_param_id: target_param_variant.id,
        },
        edgeInputParams=[target_param_id],
    )
    target_variant = Variant(
        id=target_variant_id,
        name="Target Variant",
        impl=target_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(target_impl),
    )
    target_core = Core(
        id=target_section_id,
        name="Target",
        variants=[target_variant.id],
        defaultVariant=target_variant.id,
    )

    json_impl = DictSectionImpl(
        id=json_impl_id,
        isJsonSource=True,
        jsonSourceKeys=["config"],
    )
    json_variant = Variant(
        id=json_variant_id,
        name="data/config.json",
        impl=json_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(json_impl),
    )
    json_core = Core(
        id=json_section_id,
        name="Settings",
        variants=[json_variant.id],
        defaultVariant=json_variant.id,
    )

    code_impl = CodeSectionImpl(
        id=code_impl_id,
        code="print('hello')",
    )
    code_variant = Variant(
        id=code_variant_id,
        name="Code Variant",
        impl=code_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
    )
    code_core = Core(
        id=code_section_id,
        name="Script",
        variants=[code_variant.id],
        defaultVariant=code_variant.id,
    )

    edge = Edge(
        id=edge_id,
        sourceSectionId=source_section_id,
        sourceVariantId=source_variant_id,
        sourcePortId=edge_port_id,
        targetSectionId=target_section_id,
        targetVariantId=target_variant_id,
        targetPortId=target_param_id,
    )

    project_config = ProjectConfig(
        id=project_config_id,
        name="Export Project",
        sectionVariantMap={
            source_section_id: source_variant_id,
            target_section_id: target_variant_id,
            json_section_id: json_variant_id,
            code_section_id: code_variant_id,
        },
        topLevelSections={
            source_section_id: TopLevelSectionLayout(),
            target_section_id: TopLevelSectionLayout(),
            json_section_id: TopLevelSectionLayout(),
            code_section_id: TopLevelSectionLayout(),
        },
        edges=[edge],
    )

    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={
            source_section_id: source_core,
            target_section_id: target_core,
            json_section_id: json_core,
            code_section_id: code_core,
        },
        sectionImpls={
            source_impl.id: source_impl,
            target_impl.id: target_impl,
            json_impl.id: json_impl,
            code_impl.id: code_impl,
        },
        sectionVariants={
            source_variant.id: source_variant,
            target_variant.id: target_variant,
            json_variant.id: json_variant,
            code_variant.id: code_variant,
        },
        codeObjs={
            callable_core_id: callable_core,
            source_param_id: source_param_core,
            target_root_id: target_root_core,
            target_param_id: target_param_core,
        },
        codeObjImpls={
            callable_impl.id: callable_impl,
            source_param_impl.id: source_param_impl,
            target_root_impl.id: target_root_impl,
            target_param_impl.id: target_param_impl,
        },
        codeObjVariants={
            callable_variant.id: callable_variant,
            source_param_variant.id: source_param_variant,
            target_root_variant.id: target_root_variant,
            target_param_variant.id: target_param_variant,
        },
    )

    backend = merge_single_config_into_backend(ProjectStateBackend(), project_state)
    backend.defaultProjectConfigId = project_config.id
    return backend


class TestReadableProjectExport:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.backend = _build_backend()
        self.payload = build_readable_project_export(
            self.backend,
            include_variants=True,
        )
        self.config = self.payload["configs"][0]

    def test_readable_export_has_no_uuid_like_values(self) -> None:
        yaml_payload = yaml.safe_dump(self.payload, sort_keys=False)
        uuid_pattern = re.compile(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            re.IGNORECASE,
        )
        assert uuid_pattern.search(yaml_payload) is None

    def test_readable_export_code_section_uses_file_reference(self) -> None:
        code_section = next(
            section
            for section in self.config["sections"]
            if section["type"] == "Code"
        )
        assert "files" in code_section
        assert "code" in code_section["files"]
        assert "code" not in code_section

    def test_readable_export_json_source_omits_params(self) -> None:
        json_section = next(
            section
            for section in self.config["sections"]
            if section["type"] == "Dict" and "jsonSourceKeys" in section
        )
        assert "files" in json_section
        assert "jsonSource" in json_section["files"]
        assert "params" not in json_section

    def test_readable_export_edges_use_paths(self) -> None:
        edges = self.config["edges"]
        assert {"from": "Source.out.result", "to": "Target.param.alpha"} in edges
