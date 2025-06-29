from typing import TypeVar, overload

from pydantic import BaseModel

from setta.types.code_obj_impls import (
    BaseCodeObjImpl,
)
from setta.types.generated.code_obj_core_unions import BaseCodeObjCoreUnion
from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion
from setta.types.generated.impl_modifier_unions import AllImplModifierUnion
from setta.types.generated.section_core_unions import BaseSectionCoreUnion
from setta.types.generated.section_type_unions import BaseSectionImplUnion
from setta.types.impl_layering import ImplLayering
from setta.types.project_state import (
    ProjectStateSingleConfig,
)

TImpl = TypeVar("TImpl", bound=BaseModel)


def apply_modifier(
    impl: TImpl, shared_modifier: AllImplModifierUnion, modifier: AllImplModifierUnion
) -> TImpl:
    return impl.model_copy(update={**shared_modifier, **modifier}, deep=True)


@overload
def get_effective_impl(
    impl_layering: ImplLayering,
    core: BaseSectionCoreUnion,
    impl_dict: dict[str, BaseSectionImplUnion],
) -> BaseSectionImplUnion: ...


@overload
def get_effective_impl(
    impl_layering: ImplLayering,
    core: BaseCodeObjCoreUnion,
    impl_dict: dict[str, BaseCodeObjImplUnion],
) -> BaseCodeObjImplUnion: ...


def get_effective_impl(
    impl_layering: ImplLayering,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    impl_dict: dict[str, TImpl],
) -> TImpl:
    return apply_modifier(
        impl_dict[impl_layering.impl], core.sharedModifier, impl_layering.modifier
    )


def update_impl_layerings(
    p: ProjectStateSingleConfig, implLayerings: list[str], new_impl: BaseCodeObjImpl
):
    for impl_layering_id in implLayerings:
        impl_layering = p.codeObjImplLayerings[impl_layering_id]
        impl = p.codeObjImpls[impl_layering.impl]
        p.codeObjImpls[impl_layering.impl] = impl.model_copy(
            update=new_impl.model_dump(exclude_unset=True)
        )
