from setta.types.code_obj_impls import (
    BaseCodeObjImpl,
)
from setta.types.project_state import (
    ProjectStateSingleConfig,
)


def update_variants(
    p: ProjectStateSingleConfig, variant_ids: list[str], new_impl: BaseCodeObjImpl
):
    for variant_id in variant_ids:
        variant = p.codeObjVariants[variant_id]
        impl = p.codeObjImpls[variant.impl]
        p.codeObjImpls[variant.impl] = impl.model_copy(
            update=new_impl.model_dump(exclude_unset=True)
        )
