from setta.types.code_obj_impls import CodeParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import CallableSectionImpl


def test_convert_backend_to_single_config_skips_dangling_section_param_references() -> None:
    # Build a callable section whose variant map still references a deleted param id.
    project_config_id = ID("project-1")
    section_id = ID("section-1")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")
    valid_param_id = ID("param-valid")
    missing_param_id = ID("param-missing")
    valid_param_impl_id = ID("param-impl-valid")
    valid_param_variant_id = ID("param-variant-valid")

    section_impl = CallableSectionImpl(
        id=section_impl_id,
        codeObjVariantMap={
            valid_param_id: valid_param_variant_id,
            missing_param_id: ID("param-variant-missing"),
        },
    )
    section_variant = Variant(
        id=section_variant_id,
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=section_id,
        name="Callable",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )

    valid_param_impl = CodeParamCodeObjImpl(
        id=valid_param_impl_id,
        value="x",
    )
    valid_param_variant = Variant(
        id=valid_param_variant_id,
        impl=valid_param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(valid_param_impl),
    )
    valid_param_core = Core(
        id=valid_param_id,
        name="valid",
        variants=[valid_param_variant.id],
        defaultVariant=valid_param_variant.id,
    )

    project_config = ProjectConfig(
        id=project_config_id,
        sectionVariantMap={section_id: section_variant_id},
        topLevelSections={section_id: TopLevelSectionLayout()},
    )
    backend_state = ProjectStateBackend(
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs={valid_param_id: valid_param_core},
        codeObjImpls={valid_param_impl.id: valid_param_impl},
        codeObjVariants={valid_param_variant.id: valid_param_variant},
        projectConfigs={project_config_id: project_config},
        defaultProjectConfigId=project_config_id,
    )

    # Conversion should not raise and should scrub dangling references from snapshots.
    single_config_state = convert_backend_to_single_config(
        backend_state,
        project_config_id,
    )
    assert missing_param_id not in single_config_state.codeObjs
    section_impl_after_copy = get_curr_effective_section_impl_with_type_guard(
        single_config_state,
        section_id,
        CallableSectionImpl,
    )
    assert missing_param_id not in section_impl_after_copy.codeObjVariantMap
    assert valid_param_id in section_impl_after_copy.codeObjVariantMap
