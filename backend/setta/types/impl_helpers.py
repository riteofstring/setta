from typing import Callable, Generic, Protocol, TypeVar

from pydantic import BaseModel

from setta.types.code_obj_impl_modifiers import CodeObjImplModifier
from setta.types.code_objs import (
    BaseCodeObjImpl,
    CodeObjImplLayering,
)
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.section_impl_modifiers import SectionImplModifier
from setta.types.sections import (
    BaseSectionImpl,
    SectionImplLayering,
)

TModifier = TypeVar("TModifier", bound=BaseModel)


class LayeringProtocol(Protocol, Generic[TModifier]):
    impls: list[str | TModifier]


TImpl = TypeVar("TImpl", bound=BaseModel)


def get_effective_impl(
    p: ProjectStateSingleConfig | ProjectStateBackend,
    impl_layering: LayeringProtocol[TModifier],
    impl_dict_getter: Callable[
        [ProjectStateSingleConfig | ProjectStateBackend], dict[str, TImpl]
    ],
    impl_type: type[TImpl],
    modifier_type: type[TModifier],
) -> TImpl:
    """Generic implementation layering function."""
    effective = None
    impl_dict = impl_dict_getter(p)

    for x in impl_layering.impls:
        if isinstance(x, str):
            impl = impl_dict[x]
            if not effective:
                effective = impl.model_copy(deep=True)
            else:
                effective = effective.model_copy(
                    update=impl.model_dump(exclude_unset=True)
                )
        elif isinstance(x, modifier_type):
            if not isinstance(effective, impl_type):
                raise TypeError(
                    f"Cannot apply {modifier_type.__name__} without base {impl_type.__name__}"
                )
            effective = effective.model_copy(update=x.model_dump(exclude_unset=True))
        else:
            raise TypeError(
                f"Invalid layer type: expected str or {modifier_type.__name__}, got {type(x).__name__}"
            )

    if effective is None:
        raise ValueError("No implementations provided in layering")
    return effective


# Now your specific functions become simple wrappers:
def get_effective_section_impl(
    p: ProjectStateSingleConfig | ProjectStateBackend,
    impl_layering: SectionImplLayering,
) -> BaseSectionImpl:
    return get_effective_impl(
        p=p,
        impl_layering=impl_layering,
        impl_dict_getter=lambda p: p.sectionImpls,
        impl_type=BaseSectionImpl,
        modifier_type=SectionImplModifier,
    )


def get_effective_code_obj_impl(
    p: ProjectStateSingleConfig | ProjectStateBackend,
    impl_layering: CodeObjImplLayering,
) -> BaseCodeObjImpl:
    return get_effective_impl(
        p=p,
        impl_layering=impl_layering,
        impl_dict_getter=lambda p: p.codeObjImpls,
        impl_type=BaseCodeObjImpl,
        modifier_type=CodeObjImplModifier,
    )
