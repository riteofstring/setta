from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from setta.types.code_obj_impls import BaseParamCodeObjImpl
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
)

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateCore


class ShownParamIdDetails(BaseModel, extra="forbid"):
    requiredParamIdsToPaths: dict[str, list[str]] = Field(default_factory=dict)
    topLevelParamIds: list[str] = Field(default_factory=list)


class ShownParamIds(BaseModel, extra="forbid"):
    pinned: ShownParamIdDetails = Field(default_factory=ShownParamIdDetails)
    unpinned: ShownParamIdDetails = Field(default_factory=ShownParamIdDetails)


def get_root_code_obj_ids(impl: BaseSectionWithParamsImpl):
    if isinstance(impl, CallableSectionImpl):
        return [impl.callable] if impl.callable else []
    elif isinstance(impl, BaseDictSectionImpl):
        return impl.topLevelParamIds
    else:
        raise TypeError(f"Unsupported section implementation type: {type(impl)}")


def get_param_ids_to_show(
    p: "ProjectStateCore", impl: BaseSectionWithParamsImpl
) -> ShownParamIds:
    """
    Get both pinned and unpinned parameter IDs for UI display.
    Uses a single traversal followed by filtering.
    """
    # Determine root IDs based on section type
    root_ids = get_root_code_obj_ids(impl)

    # Single traversal to get all parameters and their relationships
    result = traverse_hierarchy(
        p.codeObjs,
        p.codeObjImpls,
        p.codeObjVariants,
        impl.codeObjVariantMap,
        root_ids,
        TraversalOptions(
            collect_filter=lambda x: isinstance(x, BaseParamCodeObjImpl),
            track_path_for=lambda x: isinstance(x, BaseParamCodeObjImpl),
            build_id_to_name_path=False,  # Don't need names for UI display
            build_parent_map=False,  # Don't need parent map, we have children_map
        ),
    )

    # Filter into pinned/unpinned for UI display
    return filter_for_ui_display(
        param_ids=result.collected_ids,
        path_map=result.id_to_id_path,
        children_map=result.children_map,
        pinned_params=set(impl.pinnedParams),
    )


def filter_for_ui_display(
    param_ids: list[str],
    path_map: dict[str, list[str]],
    children_map: dict[str, list[str]],
    pinned_params: set[str],
) -> ShownParamIds:
    """
    Filter parameters for UI display where:
    - Pinned area shows: all pinned params + their descendants + ancestors to reach them
    - Unpinned area shows: all unpinned params + ancestors to reach them

    Parameters can appear in BOTH areas if they have both pinned and unpinned descendants.
    This preserves the complete tree structure in both views.
    """
    # Step 1: Determine which params belong in each area
    params_for_pinned_area: set[str] = set()
    params_for_unpinned_area: set[str] = set()

    # For each pinned parameter: add it, its ancestors, and descendants
    for param_id in param_ids:
        if param_id in pinned_params:
            # Add the param itself and all ancestors
            curr_path = path_map.get(param_id, [])
            for path_param_id in curr_path:
                params_for_pinned_area.add(path_param_id)
            # Add all descendants
            _add_descendants(param_id, children_map, params_for_pinned_area)

    # For each unpinned parameter: add it and its ancestors
    for param_id in param_ids:
        if param_id not in pinned_params:
            curr_path = path_map.get(param_id, [])
            for path_param_id in curr_path:
                params_for_unpinned_area.add(path_param_id)

    # Step 2: Build areas, filtering out empty parent nodes
    pinned_result = _build_area(
        param_ids, params_for_pinned_area, path_map, children_map
    )
    unpinned_result = _build_area(
        param_ids, params_for_unpinned_area, path_map, children_map
    )

    return ShownParamIds(pinned=pinned_result, unpinned=unpinned_result)


def _add_descendants(
    param_id: str, children_map: dict[str, list[str]], target_set: set[str]
):
    """Recursively add all descendants of a parameter to the target set."""
    for child_id in children_map.get(param_id, []):
        target_set.add(child_id)
        _add_descendants(child_id, children_map, target_set)


def _should_include_param(
    param_id: str, candidates: set[str], children_map: dict[str, list[str]]
) -> bool:
    """Check if a param should be included (is a leaf or has children in candidates)."""
    if param_id not in candidates:
        return False

    children = children_map.get(param_id, [])
    if not children:  # Leaf node
        return True

    # Has children - include only if at least one child is also included
    return any(
        _should_include_param(child, candidates, children_map)
        for child in children
        if child in candidates
    )


def _build_area(
    param_ids: list[str],
    candidates: set[str],
    path_map: dict[str, list[str]],
    children_map: dict[str, list[str]],
) -> ShownParamIdDetails:
    """Build a area including only params that are leaves or have children in the area."""
    result = ShownParamIdDetails()
    included = set()

    # Build the result for params that should be included
    for param_id in param_ids:
        if _should_include_param(param_id, candidates, children_map):
            path = path_map.get(param_id, [])
            for path_param_id in path:
                result.requiredParamIdsToPaths[path_param_id] = path_map.get(
                    path_param_id, []
                )
            included.add(param_id)

    # Identify top-level params (those with no parents in the included set)
    for param_id in param_ids:
        if param_id in included:
            has_parent = any(
                param_id in children_map.get(other, []) for other in included
            )
            if not has_parent:
                result.topLevelParamIds.append(param_id)

    return result
