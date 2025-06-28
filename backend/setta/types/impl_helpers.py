from typing import TypeVar

from pydantic import BaseModel

from setta.types.code_objs import (
    BaseCodeObjImpl,
)
from setta.types.generated.impl_modifier_unions import AllImplModifierUnion
from setta.types.impl_layering import ImplLayering
from setta.types.project_state import (
    ProjectStateSingleConfig,
)

TImpl = TypeVar("TImpl", bound=BaseModel)


def apply_modifier(impl: TImpl, modifier: AllImplModifierUnion) -> TImpl:
    return impl.model_copy(update=modifier, deep=True)


def get_effective_impl(
    impl_layering: ImplLayering,
    impl_dict: dict[str, TImpl],
) -> TImpl:
    return apply_modifier(impl_dict[impl_layering.impl], impl_layering.modifier)



def set_impl_layering_attr(
    impl: ImplType,
    layering: ImplLayering,
    impl_callback: Callable[[ImplType], None],
    modifier_callback: Callable[[ImplLayering], None],
    apply_modifier: Callable[[ImplType, dict], ImplType]
) -> ImplType:
    if not impl.isPreset:
        impl_callback(impl)
        return impl
    else:
        modifier_callback(layering)
        return apply_modifier(impl, layering.modifier)


def update_impl_layerings(
    p: ProjectStateSingleConfig, implLayerings: list[str], new_impl: BaseCodeObjImpl
):
    for impl_layering_id in implLayerings:
        impl_layering = p.codeObjImplLayerings[impl_layering_id]
        impl = p.codeObjImpls[impl_layering.impl]
        p.codeObjImpls[impl_layering.impl] = impl.model_copy(
            update=new_impl.model_dump(exclude_unset=True)
        )
