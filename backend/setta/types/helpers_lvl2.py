import logging
from typing import TYPE_CHECKING

from setta.types.code_obj_impls import (
    BaseParentCodeObjImpl,
    ControlCodeObjTypeSet,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    ChatSectionImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
    get_variant_base_and_effective_code_obj_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
from setta.types.id import ID
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    ChatSectionImpl,
    ChatSectionState,
    ListRootSectionImpl,
    MetaControlSectionImpl,
)

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from setta.types.project_state import (
        ProjectStateCore,
        ProjectStateSingleConfig,
    )


def get_curr_section_callable_code_obj(p: "ProjectStateSingleConfig", section_id: ID):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, CallableSectionImpl
    )
    if section_impl.callable:
        return p.codeObjs[section_impl.callable]
    return None


def get_curr_meta_control_impl_with_type_guard(
    p: "ProjectStateSingleConfig", section_id: ID
) -> MetaControlSectionImpl:
    impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, MetaControlSectionImpl
    )
    if impl.metaControlParamId is None:
        raise KeyError(f"Meta control {section_id} has no control param id.")
    if impl.metaControlParamId not in impl.codeObjVariantMap:
        raise KeyError(f"Meta control {section_id} missing code obj variant mapping.")
    return impl


def get_meta_control_param_id(p: "ProjectStateSingleConfig", section_id: ID) -> ID:
    impl = get_curr_meta_control_impl_with_type_guard(p, section_id)
    param_id = impl.metaControlParamId
    if param_id not in p.codeObjs:
        raise KeyError(f"Meta control {section_id} missing control code obj core.")
    if param_id not in impl.codeObjVariantMap:
        raise KeyError(
            f"Meta control {section_id} missing variant map for control param."
        )
    variant_id = impl.codeObjVariantMap[param_id]
    if variant_id not in p.codeObjVariants:
        raise KeyError(
            f"Meta control {section_id} missing variant for control param {param_id}."
        )
    code_obj_impl = p.codeObjImpls[p.codeObjVariants[variant_id].impl]
    if code_obj_impl.type not in ControlCodeObjTypeSet:
        raise TypeError(
            f"Meta control {section_id} uses unsupported code obj type {code_obj_impl.type}."
        )
    return param_id


def _get_curr_section_children_ids(
    p: "ProjectStateSingleConfig",
    section_id: ID,
):
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseParentSectionImpl
    )
    return section_impl.children


def get_curr_top_level_param_ids(
    p: "ProjectStateSingleConfig",
    section_id: ID,
) -> list[ID]:
    section_impl = get_curr_effective_section_impl_with_type_guard(
        p, section_id, BaseSectionWithParamsImpl
    )
    return get_top_level_param_ids(p, section_impl)


def get_top_level_param_ids(
    p: "ProjectStateCore", section_impl: BaseSectionWithParamsImpl
) -> list[ID]:
    parentCodeObjId: ID | None = None
    if isinstance(section_impl, CallableSectionImpl):
        parentCodeObjId = section_impl.callable
    elif isinstance(section_impl, BaseDictSectionImpl):
        parentCodeObjId = section_impl.topLevelParamId
    else:
        raise TypeError

    if not parentCodeObjId:
        return []

    codeObj = p.codeObjs[parentCodeObjId]
    _, _, code_obj_impl = get_variant_base_and_effective_code_obj_impl_with_type_guard(
        p,
        codeObj,
        section_impl.codeObjVariantMap[parentCodeObjId],
        BaseParentCodeObjImpl,
    )
    return code_obj_impl.children


def get_section_path_full_name(p: "ProjectStateSingleConfig", section_id: ID):
    parent_id = p.parentSectionMap[section_id]
    if not parent_id:
        return p.sections[section_id].name

    child_id = section_id
    output = ""
    while parent_id:
        child_impl = get_curr_effective_section_impl(p, child_id)
        if isinstance(child_impl, ListRootSectionImpl):
            idx = _get_curr_section_children_ids(p, parent_id).index(child_id)
            output = f"[{idx}]{output}"
        else:
            child_name = p.sections[child_id].name
            output = f'["{child_name}"]{output}'

        child_id = parent_id
        parent_id = p.parentSectionMap[parent_id]

    # child_id will contain the highest parent's id
    child_name = p.sections[child_id].name
    return f"{child_name}{output}"


def set_chat_section_chat_id(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    chatId: ID | None,
):
    get_curr_effective_section_impl_with_type_guard(p, sectionId, ChatSectionImpl)
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        ChatSectionImplArgsWithCallable(
            chatId=chatId,
        ),
    )


def set_chat_section_state(
    p: "ProjectStateSingleConfig",
    sectionId: ID,
    state: ChatSectionState,
):
    get_curr_effective_section_impl_with_type_guard(p, sectionId, ChatSectionImpl)
    set_curr_effective_section_impl_value(
        p,
        sectionId,
        ChatSectionImplArgsWithCallable(
            messages=state.messages,
            inputText=state.inputText,
            waitingForResponse=state.waitingForResponse,
            toolCallArguments=state.toolCallArguments,
            activeBranchId=state.activeBranchId,
            branches=state.branches,
        ),
    )
