from setta.types.code_obj_impls import (
    BaseCodeObjImpl,
)
from setta.types.project_state import (
    ProjectStateSingleConfig,
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
