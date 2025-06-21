from typing import TypeVar

from pydantic import BaseModel

from setta.types.code_objs import (
    BaseCodeObjImpl,
    CodeObjImplLayering,
)
from setta.types.impl_layering import ImplLayering
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.sections import (
    SectionImplLayering,
)

TImpl = TypeVar("TImpl", bound=BaseModel)


def get_effective_impl(
    impl_layering: ImplLayering,
    impl_dict: dict[str, TImpl],
) -> TImpl:
    effective = impl_dict[impl_layering.impl].model_copy(deep=True)

    for x in impl_layering.modifiers:
        effective = effective.model_copy(update=x.model_dump())
    return effective


def get_effective_section_impl(
    p: ProjectStateSingleConfig | ProjectStateBackend,
    impl_layering: SectionImplLayering,
):
    return get_effective_impl(
        impl_layering=impl_layering,
        impl_dict=p.sectionImpls,
    )


def get_effective_code_obj_impl(
    p: ProjectStateSingleConfig | ProjectStateBackend,
    impl_layering: CodeObjImplLayering,
):
    return get_effective_impl(
        impl_layering=impl_layering,
        impl_dict=p.codeObjImpls,
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
