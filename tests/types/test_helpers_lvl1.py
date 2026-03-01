from setta.types.code_obj_impls import BaseParamCodeObjImpl
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_for_read_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.id import ID
from setta.types.section_impls import BaseSectionWithParamsImpl
from tests.code_gen.test_code_generator_formatting import build_callable_project_state


SECTION_ID = ID("section-1")
PARAM_ID = ID("param-0")


def _get_base_param_impl(
    state,
) -> BaseParamCodeObjImpl:
    section_impl = get_curr_effective_section_impl_with_type_guard(
        state,
        SECTION_ID,
        BaseSectionWithParamsImpl,
    )
    variant_id = section_impl.codeObjVariantMap[PARAM_ID]
    impl_id = state.codeObjVariants[variant_id].impl
    impl = state.codeObjImpls[impl_id]
    if not isinstance(impl, BaseParamCodeObjImpl):
        raise TypeError(f"Expected BaseParamCodeObjImpl, got {type(impl)}")
    return impl


def test_get_curr_effective_code_obj_impl_for_read_reuses_base_impl_without_modifiers():
    state = build_callable_project_state(4)
    base_impl = _get_base_param_impl(state)

    # No modifiers means the helper should reuse the base impl object directly.
    resolved_impl = get_curr_effective_code_obj_impl_for_read_with_type_guard(
        state,
        SECTION_ID,
        PARAM_ID,
        BaseParamCodeObjImpl,
    )

    assert resolved_impl is base_impl


def test_get_curr_effective_code_obj_impl_for_read_applies_variant_modifier():
    state = build_callable_project_state(4)
    section_impl = get_curr_effective_section_impl_with_type_guard(
        state,
        SECTION_ID,
        BaseSectionWithParamsImpl,
    )
    variant_id = section_impl.codeObjVariantMap[PARAM_ID]
    state.codeObjVariants[variant_id].modifier["value"] = "from-variant-modifier"
    base_impl = _get_base_param_impl(state)

    # Variant modifiers must still produce an effective impl snapshot.
    resolved_impl = get_curr_effective_code_obj_impl_for_read_with_type_guard(
        state,
        SECTION_ID,
        PARAM_ID,
        BaseParamCodeObjImpl,
    )

    assert resolved_impl is not base_impl
    assert resolved_impl.value == "from-variant-modifier"
    assert base_impl.value != "from-variant-modifier"


def test_get_curr_effective_code_obj_impl_for_read_applies_core_shared_modifier():
    state = build_callable_project_state(4)
    state.codeObjs[PARAM_ID].sharedModifier["value"] = "from-core-modifier"
    base_impl = _get_base_param_impl(state)

    # Core-level shared modifiers must also bypass the fast-path fallback.
    resolved_impl = get_curr_effective_code_obj_impl_for_read_with_type_guard(
        state,
        SECTION_ID,
        PARAM_ID,
        BaseParamCodeObjImpl,
    )

    assert resolved_impl is not base_impl
    assert resolved_impl.value == "from-core-modifier"
    assert base_impl.value != "from-core-modifier"
