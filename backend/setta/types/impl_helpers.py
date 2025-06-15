from typing import Callable, Generic, Protocol, TypeVar

from pydantic import BaseModel

from setta.types.code_objs import (
    CodeObjImplLayering,
)
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.sections import (
    SectionImplLayering,
)

TModifier = TypeVar("TModifier", bound=BaseModel)


class LayeringProtocol(Protocol, Generic[TModifier]):
    impl: str
    modifiers: list[TModifier]


TImpl = TypeVar("TImpl", bound=BaseModel)


def get_effective_impl(
    p: ProjectStateSingleConfig | ProjectStateBackend,
    impl_layering: LayeringProtocol[TModifier],
    impl_dict_getter: Callable[
        [ProjectStateSingleConfig | ProjectStateBackend], dict[str, TImpl]
    ],
) -> TImpl:
    impl_dict = impl_dict_getter(p)
    effective = impl_dict[impl_layering.impl].model_copy(deep=True)

    for x in impl_layering.modifiers:
        effective = effective.model_copy(update=x.model_dump())
    return effective


def get_effective_section_impl(
    p: ProjectStateSingleConfig | ProjectStateBackend,
    impl_layering: SectionImplLayering,
):
    return get_effective_impl(
        p=p,
        impl_layering=impl_layering,
        impl_dict_getter=lambda p: p.sectionImpls,
    )


def get_effective_code_obj_impl(
    p: ProjectStateSingleConfig | ProjectStateBackend,
    impl_layering: CodeObjImplLayering,
):
    return get_effective_impl(
        p=p,
        impl_layering=impl_layering,
        impl_dict_getter=lambda p: p.codeObjImpls,
    )
