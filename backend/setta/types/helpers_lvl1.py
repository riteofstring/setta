from typing import TYPE_CHECKING, TypeVar

from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import (
    get_effective_impl,
    set_effective_impl_value,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseCodeObjImplArgsWithCallable,
    BaseSectionImplArgsWithCallable,
)
from setta.types.id import ID
from setta.types.section_impls import (
    BaseSectionImpl,
    BaseSectionWithParamsImpl,
    MetaControlSectionImpl,
)

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateCore, ProjectStateSingleConfig


GenericBaseSectionImplType = TypeVar(
    "GenericBaseSectionImplType", bound=BaseSectionImpl
)

GenericBaseCodeObjImplType = TypeVar(
    "GenericBaseCodeObjImplType", bound=BaseCodeObjImpl
)


def get_curr_section_variant(
    p: "ProjectStateSingleConfig",
    section_id: ID,
):
    variant_id = p.projectConfig.sectionVariantMap[section_id]
    return p.sectionVariants[variant_id]


def get_curr_effective_section_impl(
    p: "ProjectStateSingleConfig",
    section_id: ID,
):
    variant = get_curr_section_variant(p, section_id)
    base_impl = p.sectionImpls[variant.impl]
    core = p.sections[section_id]
    return get_effective_impl(base_impl, core, variant)


def get_curr_effective_section_impl_for_read(
    p: "ProjectStateSingleConfig",
    section_id: ID,
):
    variant = get_curr_section_variant(p, section_id)
    base_impl = p.sectionImpls[variant.impl]
    core = p.sections[section_id]
    if len(core.sharedModifier) == 0 and len(variant.modifier) == 0:
        return base_impl
    return get_effective_impl(base_impl, core, variant)


def get_curr_effective_section_impl_with_type_guard(
    project_state: "ProjectStateSingleConfig",
    section_id: ID,
    impl_type: type[GenericBaseSectionImplType],
) -> GenericBaseSectionImplType:
    impl = get_curr_effective_section_impl(project_state, section_id)

    if not isinstance(impl, impl_type):
        raise ValueError(f"Section {section_id} failed type guard")

    return impl


def get_curr_effective_section_impl_for_read_with_type_guard(
    project_state: "ProjectStateSingleConfig",
    section_id: ID,
    impl_type: type[GenericBaseSectionImplType],
) -> GenericBaseSectionImplType:
    impl = get_curr_effective_section_impl_for_read(project_state, section_id)

    if not isinstance(impl, impl_type):
        raise ValueError(f"Section {section_id} failed type guard")

    return impl


def get_variant_effective_section_impl(
    p: "ProjectStateCore", sectionId: ID, variantId: ID
):
    variant = p.sectionVariants[variantId]
    impl = p.sectionImpls[variant.impl]
    core = p.sections[sectionId]
    return get_effective_impl(impl, core, variant)


def get_variant_base_and_effective_section_impl(
    p: "ProjectStateCore", core: Core, variant_id: ID
):
    variant = p.sectionVariants[variant_id]
    base_impl = p.sectionImpls[variant.impl]
    impl = get_effective_impl(base_impl, core, variant)
    return variant, base_impl, impl


def get_variant_base_and_effective_section_impl_with_type_guard(
    p: "ProjectStateCore",
    core: Core,
    variant_id: ID,
    impl_type: type[GenericBaseSectionImplType],
) -> tuple[Variant, GenericBaseSectionImplType, GenericBaseSectionImplType]:
    variant, base_impl, impl = get_variant_base_and_effective_section_impl(
        p, core, variant_id
    )
    if not isinstance(base_impl, impl_type) or not isinstance(impl, impl_type):
        raise TypeError
    return variant, base_impl, impl


def get_curr_code_obj_variant(
    p: "ProjectStateSingleConfig", sectionId: ID, codeObjId: ID
):
    section_impl = get_curr_effective_section_impl(p, sectionId)
    if isinstance(section_impl, BaseSectionWithParamsImpl):
        variant_id = section_impl.codeObjVariantMap[codeObjId]
        return p.codeObjVariants[variant_id]
    if isinstance(section_impl, MetaControlSectionImpl):
        if section_impl.metaControlParamId is None:
            raise KeyError(f"Meta control {sectionId} has no control param id.")
        if section_impl.metaControlParamId != codeObjId:
            raise KeyError(
                f"Meta control {sectionId} uses different control param {section_impl.metaControlParamId}."
            )
        if codeObjId not in section_impl.codeObjVariantMap:
            raise KeyError(
                f"Meta control {sectionId} missing variant map for control param."
            )
        variant_id = section_impl.codeObjVariantMap[codeObjId]
        return p.codeObjVariants[variant_id]
    raise TypeError(f"Section {sectionId} does not support code obj variants.")


def get_curr_effective_code_obj_impl(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    codeObjId: ID,
):
    variant = get_curr_code_obj_variant(p, sectionId, codeObjId)
    baseImpl = p.codeObjImpls[variant.impl]
    core = p.codeObjs[codeObjId]
    return get_effective_impl(baseImpl, core, variant)


def get_curr_effective_code_obj_impl_for_read(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    codeObjId: ID,
):
    """Resolve code obj impl for read-heavy paths without unnecessary deep copies."""
    section_variant = get_curr_section_variant(p, sectionId)
    base_section_impl = p.sectionImpls[section_variant.impl]
    section_core = p.sections[sectionId]
    section_impl = (
        base_section_impl
        if len(section_core.sharedModifier) == 0 and len(section_variant.modifier) == 0
        else get_effective_impl(base_section_impl, section_core, section_variant)
    )
    if isinstance(section_impl, BaseSectionWithParamsImpl):
        variant_id = section_impl.codeObjVariantMap[codeObjId]
    elif isinstance(section_impl, MetaControlSectionImpl):
        if section_impl.metaControlParamId is None:
            raise KeyError(f"Meta control {sectionId} has no control param id.")
        if section_impl.metaControlParamId != codeObjId:
            raise KeyError(
                f"Meta control {sectionId} uses different control param {section_impl.metaControlParamId}."
            )
        if codeObjId not in section_impl.codeObjVariantMap:
            raise KeyError(
                f"Meta control {sectionId} missing variant map for control param."
            )
        variant_id = section_impl.codeObjVariantMap[codeObjId]
    else:
        raise TypeError(f"Section {sectionId} does not support code obj variants.")

    variant = p.codeObjVariants[variant_id]
    base_impl = p.codeObjImpls[variant.impl]
    core = p.codeObjs[codeObjId]
    if len(core.sharedModifier) == 0 and len(variant.modifier) == 0:
        return base_impl
    return get_effective_impl(base_impl, core, variant)


def get_curr_effective_code_obj_impl_with_type_guard(
    project_state: "ProjectStateSingleConfig",
    sectionId: ID,
    codeObjId: ID,
    impl_type: type[GenericBaseCodeObjImplType],
) -> GenericBaseCodeObjImplType:
    impl = get_curr_effective_code_obj_impl(project_state, sectionId, codeObjId)

    if not isinstance(impl, impl_type):
        raise ValueError(f"Section {sectionId}, codeObj {codeObjId} failed type guard")

    return impl


def get_curr_effective_code_obj_impl_for_read_with_type_guard(
    project_state: "ProjectStateSingleConfig",
    sectionId: ID,
    codeObjId: ID,
    impl_type: type[GenericBaseCodeObjImplType],
) -> GenericBaseCodeObjImplType:
    impl = get_curr_effective_code_obj_impl_for_read(
        project_state, sectionId, codeObjId
    )

    if not isinstance(impl, impl_type):
        raise ValueError(f"Section {sectionId}, codeObj {codeObjId} failed type guard")

    return impl


def get_variant_base_code_obj_impl(p: "ProjectStateCore", variantId: ID):
    variant = p.codeObjVariants[variantId]
    return p.codeObjImpls[variant.impl]


def get_variant_base_and_effective_code_obj_impl(
    p: "ProjectStateCore", core: Core, variant_id: ID
):
    variant = p.codeObjVariants[variant_id]
    base_impl = p.codeObjImpls[variant.impl]
    impl = get_effective_impl(base_impl, core, variant)
    return variant, base_impl, impl


def get_variant_base_and_effective_code_obj_impl_with_type_guard(
    p: "ProjectStateCore",
    core: Core,
    variant_id: ID,
    impl_type: type[GenericBaseCodeObjImplType],
) -> tuple[Variant, GenericBaseCodeObjImplType, GenericBaseCodeObjImplType]:
    variant, base_impl, impl = get_variant_base_and_effective_code_obj_impl(
        p, core, variant_id
    )
    if not isinstance(base_impl, impl_type) or not isinstance(impl, impl_type):
        raise TypeError
    return variant, base_impl, impl


def set_curr_effective_section_impl_value(
    p: "ProjectStateSingleConfig", sectionId: ID, args: BaseSectionImplArgsWithCallable
):
    variant = get_curr_section_variant(p, sectionId)
    impl = p.sectionImpls[variant.impl]
    core = p.sections[sectionId]
    set_effective_impl_value(impl, core, variant, args)


def set_curr_effective_code_obj_impl_value(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    codeObjId: ID,
    args: BaseCodeObjImplArgsWithCallable,
):
    variant = get_curr_code_obj_variant(p, sectionId, codeObjId)
    impl = p.codeObjImpls[variant.impl]
    core = p.codeObjs[codeObjId]
    set_effective_impl_value(impl, core, variant, args)


def get_curr_section_base_impl(p: "ProjectStateSingleConfig", sectionId: ID):
    variant = get_curr_section_variant(p, sectionId)
    return p.sectionImpls[variant.impl]
