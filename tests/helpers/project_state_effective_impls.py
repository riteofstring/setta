from typing import TYPE_CHECKING

from setta.types.generated.effective_impls import set_effective_impl_value
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseCodeObjImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import get_curr_code_obj_variant
from setta.types.id import ID

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateSingleConfig


def set_curr_effective_code_obj_impl_value(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    codeObjId: ID,
    args: BaseCodeObjImplArgsWithCallable,
) -> None:
    variant = get_curr_code_obj_variant(p, sectionId, codeObjId)
    impl = p.codeObjImpls[variant.impl]
    core = p.codeObjs[codeObjId]
    set_effective_impl_value(impl, core, variant, args)
