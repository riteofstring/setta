import logging
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from setta.types.code_obj_impls import BaseParamCodeObjImpl, BaseParentCodeObjImpl
from setta.types.generated.effective_impls import get_effective_impl
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.id import ID
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
)

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateSingleConfig

logger = logging.getLogger(__name__)


class ShownParamIdDetails(BaseModel, extra="forbid"):
    requiredParamIdsToPaths: dict[ID, tuple[ID, ...]] = Field(default_factory=dict)
    topLevelParamIds: list[ID] = Field(default_factory=list)


class ShownParamIds(BaseModel, extra="forbid"):
    pinned: ShownParamIdDetails = Field(default_factory=ShownParamIdDetails)
    unpinned: ShownParamIdDetails = Field(default_factory=ShownParamIdDetails)


def get_param_ids_to_show(
    p: "ProjectStateSingleConfig", impl: BaseSectionWithParamsImpl
) -> ShownParamIds:
    """
    Get both pinned and unpinned parameter IDs for UI display.
    Uses a single traversal followed by filtering.
    """
    if isinstance(impl, CallableSectionImpl):
        root_code_obj_id = impl.callable
    elif isinstance(impl, BaseDictSectionImpl):
        root_code_obj_id = impl.topLevelParamId
    else:
        raise TypeError(
            f"Unsupported section impl type for shown params traversal: {impl.type}"
        )
    if root_code_obj_id is None:
        return ShownParamIds()
    if root_code_obj_id not in impl.codeObjVariantMap:
        logger.warning(
            "get_param_ids_to_show missing root mapping section_impl_id=%s root_code_obj_id=%s",
            impl.id,
            root_code_obj_id,
        )
        return ShownParamIds()
    if root_code_obj_id not in p.codeObjs:
        logger.warning(
            "get_param_ids_to_show missing root code obj section_impl_id=%s root_code_obj_id=%s",
            impl.id,
            root_code_obj_id,
        )
        return ShownParamIds()
    root_variant_id = impl.codeObjVariantMap[root_code_obj_id]
    if root_variant_id not in p.codeObjVariants:
        logger.warning(
            "get_param_ids_to_show missing root variant section_impl_id=%s root_code_obj_id=%s root_variant_id=%s",
            impl.id,
            root_code_obj_id,
            root_variant_id,
        )
        return ShownParamIds()
    root_variant = p.codeObjVariants[root_variant_id]
    root_impl_id = root_variant.impl
    if root_impl_id not in p.codeObjImpls:
        logger.warning(
            "get_param_ids_to_show missing root impl section_impl_id=%s root_code_obj_id=%s root_impl_id=%s",
            impl.id,
            root_code_obj_id,
            root_impl_id,
        )
        return ShownParamIds()
    root_impl = get_effective_impl(
        p.codeObjImpls[root_impl_id],
        p.codeObjs[root_code_obj_id],
        root_variant,
    )
    if not isinstance(root_impl, BaseParentCodeObjImpl):
        logger.warning(
            "get_param_ids_to_show root impl is not parent section_impl_id=%s root_code_obj_id=%s root_impl_type=%s",
            impl.id,
            root_code_obj_id,
            type(root_impl).__name__,
        )
        return ShownParamIds()
    top_level_ids = root_impl.children

    # Single traversal to get all parameters and their relationships
    result = traverse_hierarchy(
        p.codeObjs,
        p.codeObjImpls,
        p.codeObjVariants,
        impl.codeObjVariantMap,
        top_level_ids,
        options=TraversalOptions(
            collect_filter=lambda x: isinstance(x, BaseParamCodeObjImpl),
            track_path_for=lambda x: isinstance(x, BaseParamCodeObjImpl),
            build_id_to_id_path=True,
            build_children_map=True,
            skip_missing_references=True,
        ),
    )

    # Filter into pinned/unpinned for UI display
    return filter_for_ui_display(
        param_ids=result.collected_ids,
        id_to_id_path=result.id_to_id_path,
        children_map=result.children_map,
        pinned_params=set(impl.pinnedParams),
    )


def filter_for_ui_display(
    param_ids: list[ID],
    id_to_id_path: dict[ID, tuple[ID, ...]],
    children_map: dict[ID, list[ID]],
    pinned_params: set[ID],
) -> ShownParamIds:
    """
    Filter parameters for UI display where:
    - Pinned area shows: all pinned params + their descendants + ancestors to reach them
    - Unpinned area shows: all unpinned params + ancestors to reach them

    Parameters can appear in BOTH areas if they have both pinned and unpinned descendants.
    This preserves the complete tree structure in both views.
    """
    # Step 1: Determine which params belong in each area
    params_for_pinned_area: set[ID] = set()
    params_for_unpinned_area: set[ID] = set()

    # For each pinned parameter: add it, its ancestors, and descendants
    for param_id in param_ids:
        if param_id in pinned_params:
            # Add the param itself and all ancestors
            curr_path = id_to_id_path.get(param_id, [])
            for path_param_id in curr_path:
                params_for_pinned_area.add(path_param_id)
            # Add all descendants
            _add_descendants(param_id, children_map, params_for_pinned_area)

    # For each unpinned parameter: add it and its ancestors
    for param_id in param_ids:
        if param_id not in pinned_params:
            curr_path = id_to_id_path.get(param_id, [])
            for path_param_id in curr_path:
                params_for_unpinned_area.add(path_param_id)

    # Step 2: Build areas, filtering out empty parent nodes
    pinned_result = _build_area(
        param_ids, params_for_pinned_area, id_to_id_path, children_map
    )
    unpinned_result = _build_area(
        param_ids, params_for_unpinned_area, id_to_id_path, children_map
    )

    return ShownParamIds(
        pinned=pinned_result,
        unpinned=unpinned_result,
    )


def _add_descendants(
    param_id: ID, children_map: dict[ID, list[ID]], target_set: set[ID]
):
    """Add all descendants of a parameter to the target set."""
    to_visit = list(children_map.get(param_id, []))
    while to_visit:
        child_id = to_visit.pop()
        if child_id in target_set:
            continue
        target_set.add(child_id)
        to_visit.extend(children_map.get(child_id, []))


def _build_parent_map(children_map: dict[ID, list[ID]]) -> dict[ID, ID]:
    parent_map: dict[ID, ID] = {}
    for parent_id, children in children_map.items():
        for child_id in children:
            parent_map[child_id] = parent_id
    return parent_map


def _compute_included_params(
    candidates: set[ID],
    children_map: dict[ID, list[ID]],
    parent_map: dict[ID, ID],
) -> set[ID]:
    if not candidates:
        return set()

    remaining_candidate_children: dict[ID, int] = {}
    has_included_candidate_child: dict[ID, bool] = {}
    ready: list[ID] = []
    for param_id in candidates:
        candidate_child_count = 0
        for child_id in children_map.get(param_id, []):
            if child_id in candidates:
                candidate_child_count += 1
        remaining_candidate_children[param_id] = candidate_child_count
        has_included_candidate_child[param_id] = False
        if candidate_child_count == 0:
            ready.append(param_id)

    included: set[ID] = set()
    while ready:
        current = ready.pop()
        children = children_map.get(current, [])
        is_leaf = len(children) == 0
        current_included = is_leaf or has_included_candidate_child[current]
        if current_included:
            included.add(current)

        parent_id = parent_map.get(current)
        if parent_id in remaining_candidate_children:
            if current_included:
                has_included_candidate_child[parent_id] = True
            remaining_candidate_children[parent_id] -= 1
            if remaining_candidate_children[parent_id] == 0:
                ready.append(parent_id)

    return included


def _build_area(
    param_ids: list[ID],
    candidates: set[ID],
    id_to_id_path: dict[ID, tuple[ID, ...]],
    children_map: dict[ID, list[ID]],
) -> ShownParamIdDetails:
    """Build a area including only params that are leaves or have children in the area."""
    result = ShownParamIdDetails()
    parent_map = _build_parent_map(children_map)
    included = _compute_included_params(candidates, children_map, parent_map)

    # Build the result for params that should be included
    for param_id in param_ids:
        if param_id not in included:
            continue
        path = id_to_id_path.get(param_id, [])
        for path_param_id in path:
            result.requiredParamIdsToPaths[path_param_id] = id_to_id_path.get(
                path_param_id, ()
            )

    # Identify top-level params (those with no parents in the included set)
    for param_id in param_ids:
        if param_id not in included:
            continue
        parent_id = parent_map.get(param_id)
        if parent_id not in included:
            result.topLevelParamIds.append(param_id)

    return result
