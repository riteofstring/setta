from setta.types.code_obj_impls import CodeCallableCodeObjImpl, CodeParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
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


def test_convert_backend_to_single_config_sanitizes_dangling_callable_children() -> None:
    # Build a callable tree where the callable impl still references a deleted child id.
    project_config_id = ID("project-1")
    section_id = ID("section-1")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")
    callable_id = ID("callable-1")
    callable_impl_id = ID("callable-impl-1")
    callable_variant_id = ID("callable-variant-1")
    valid_param_id = ID("param-valid")
    missing_param_id = ID("param-missing")
    valid_param_impl_id = ID("param-impl-valid")
    valid_param_variant_id = ID("param-variant-valid")

    callable_impl = CodeCallableCodeObjImpl(
        id=callable_impl_id,
        children=[valid_param_id, missing_param_id],
    )
    callable_variant = Variant(
        id=callable_variant_id,
        impl=callable_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
    )
    callable_core = Core(
        id=callable_id,
        name="callable",
        variants=[callable_variant.id],
        defaultVariant=callable_variant.id,
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

    section_impl = CallableSectionImpl(
        id=section_impl_id,
        callable=callable_id,
        codeObjVariantMap={
            callable_id: callable_variant.id,
            valid_param_id: valid_param_variant.id,
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
    project_config = ProjectConfig(
        id=project_config_id,
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
    )
    backend_state = ProjectStateBackend(
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs={callable_id: callable_core, valid_param_id: valid_param_core},
        codeObjImpls={
            callable_impl.id: callable_impl,
            valid_param_impl.id: valid_param_impl,
        },
        codeObjVariants={
            callable_variant.id: callable_variant,
            valid_param_variant.id: valid_param_variant,
        },
        projectConfigs={project_config_id: project_config},
        defaultProjectConfigId=project_config_id,
    )

    # Conversion should scrub the dangling child reference so shown-param validation
    # cannot crash while traversing top-level callable children.
    single_config_state = convert_backend_to_single_config(
        backend_state,
        project_config_id,
    )
    callable_impl_after_copy = get_curr_effective_code_obj_impl_with_type_guard(
        single_config_state,
        section_id,
        callable_id,
        CodeCallableCodeObjImpl,
    )
    assert callable_impl_after_copy.children == [valid_param_id]
    shown_params = single_config_state.shownParamIds[section_variant_id]
    assert shown_params.unpinned.topLevelParamIds == [valid_param_id]


def test_convert_backend_to_single_config_sanitizes_children_missing_from_variant_map() -> (
    None
):
    # Build a callable tree where a child code obj still exists in state but
    # is no longer present in the section's codeObjVariantMap.
    project_config_id = ID("project-1")
    section_id = ID("section-1")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")
    callable_id = ID("callable-1")
    callable_impl_id = ID("callable-impl-1")
    callable_variant_id = ID("callable-variant-1")
    kept_param_id = ID("param-kept")
    kept_param_impl_id = ID("param-impl-kept")
    kept_param_variant_id = ID("param-variant-kept")
    stale_param_id = ID("param-stale")
    stale_param_impl_id = ID("param-impl-stale")
    stale_param_variant_id = ID("param-variant-stale")

    callable_impl = CodeCallableCodeObjImpl(
        id=callable_impl_id,
        children=[kept_param_id, stale_param_id],
    )
    callable_variant = Variant(
        id=callable_variant_id,
        impl=callable_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
    )
    callable_core = Core(
        id=callable_id,
        name="callable",
        variants=[callable_variant.id],
        defaultVariant=callable_variant.id,
    )

    kept_param_impl = CodeParamCodeObjImpl(
        id=kept_param_impl_id,
        value="x",
    )
    kept_param_variant = Variant(
        id=kept_param_variant_id,
        impl=kept_param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(kept_param_impl),
    )
    kept_param_core = Core(
        id=kept_param_id,
        name="kept",
        variants=[kept_param_variant.id],
        defaultVariant=kept_param_variant.id,
    )

    stale_param_impl = CodeParamCodeObjImpl(
        id=stale_param_impl_id,
        value="y",
    )
    stale_param_variant = Variant(
        id=stale_param_variant_id,
        impl=stale_param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(stale_param_impl),
    )
    stale_param_core = Core(
        id=stale_param_id,
        name="stale",
        variants=[stale_param_variant.id],
        defaultVariant=stale_param_variant.id,
    )

    section_impl = CallableSectionImpl(
        id=section_impl_id,
        callable=callable_id,
        codeObjVariantMap={
            callable_id: callable_variant.id,
            kept_param_id: kept_param_variant.id,
            # stale_param_id intentionally omitted.
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
    project_config = ProjectConfig(
        id=project_config_id,
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
    )
    backend_state = ProjectStateBackend(
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs={
            callable_id: callable_core,
            kept_param_id: kept_param_core,
            stale_param_id: stale_param_core,
        },
        codeObjImpls={
            callable_impl.id: callable_impl,
            kept_param_impl.id: kept_param_impl,
            stale_param_impl.id: stale_param_impl,
        },
        codeObjVariants={
            callable_variant.id: callable_variant,
            kept_param_variant.id: kept_param_variant,
            stale_param_variant.id: stale_param_variant,
        },
        projectConfigs={project_config_id: project_config},
        defaultProjectConfigId=project_config_id,
    )

    single_config_state = convert_backend_to_single_config(
        backend_state,
        project_config_id,
    )
    callable_impl_after_copy = get_curr_effective_code_obj_impl_with_type_guard(
        single_config_state,
        section_id,
        callable_id,
        CodeCallableCodeObjImpl,
    )
    assert callable_impl_after_copy.children == [kept_param_id]
    shown_params = single_config_state.shownParamIds[section_variant_id]
    assert shown_params.unpinned.topLevelParamIds == [kept_param_id]


def test_convert_backend_to_single_config_shown_param_traversal_skips_dangling_children_with_missing_core() -> (
    None
):
    # Build a callable section state where a stale child id still appears in the
    # callable children list and section variant map, but the code object core no
    # longer exists in backend.codeObjs.
    project_config_id = ID("project-1")
    section_id = ID("section-1")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")
    callable_id = ID("callable-1")
    callable_impl_id = ID("callable-impl-1")
    callable_variant_id = ID("callable-variant-1")
    kept_param_id = ID("param-kept")
    kept_param_impl_id = ID("param-impl-kept")
    kept_param_variant_id = ID("param-variant-kept")
    missing_param_id = ID("param-missing")
    missing_param_variant_id = ID("param-variant-missing")

    callable_impl = CodeCallableCodeObjImpl(
        id=callable_impl_id,
        children=[kept_param_id, missing_param_id],
    )
    callable_variant = Variant(
        id=callable_variant_id,
        impl=callable_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
    )
    callable_core = Core(
        id=callable_id,
        name="callable",
        variants=[callable_variant.id],
        defaultVariant=callable_variant.id,
    )

    kept_param_impl = CodeParamCodeObjImpl(
        id=kept_param_impl_id,
        value="x",
    )
    kept_param_variant = Variant(
        id=kept_param_variant_id,
        impl=kept_param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(kept_param_impl),
    )
    kept_param_core = Core(
        id=kept_param_id,
        name="kept",
        variants=[kept_param_variant.id],
        defaultVariant=kept_param_variant.id,
    )

    section_impl = CallableSectionImpl(
        id=section_impl_id,
        callable=callable_id,
        codeObjVariantMap={
            callable_id: callable_variant.id,
            kept_param_id: kept_param_variant.id,
            # stale mapping intentionally references a code obj id that no longer
            # exists in backend.codeObjs.
            missing_param_id: missing_param_variant_id,
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
    project_config = ProjectConfig(
        id=project_config_id,
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
    )
    backend_state = ProjectStateBackend(
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs={callable_id: callable_core, kept_param_id: kept_param_core},
        codeObjImpls={
            callable_impl.id: callable_impl,
            kept_param_impl.id: kept_param_impl,
        },
        codeObjVariants={
            callable_variant.id: callable_variant,
            kept_param_variant.id: kept_param_variant,
        },
        projectConfigs={project_config_id: project_config},
        defaultProjectConfigId=project_config_id,
    )

    # Conversion should tolerate the stale child and stale mapping without
    # throwing, and keep shown-param output stable for surviving params.
    single_config_state = convert_backend_to_single_config(
        backend_state,
        project_config_id,
    )
    callable_impl_after_copy = get_curr_effective_code_obj_impl_with_type_guard(
        single_config_state,
        section_id,
        callable_id,
        CodeCallableCodeObjImpl,
    )
    assert callable_impl_after_copy.children == [kept_param_id]
    shown_params = single_config_state.shownParamIds[section_variant_id]
    assert shown_params.unpinned.topLevelParamIds == [kept_param_id]
