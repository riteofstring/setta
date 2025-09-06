from dataclasses import dataclass, field
from typing import Callable, Optional

from setta.types.code_obj_impls import BaseParentCodeObjImpl
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import get_effective_impl
from setta.types.generated.unions import BaseCodeObjImplUnion


@dataclass
class TraversalOptions:
    # Filters
    collect_filter: Optional[Callable[[BaseCodeObjImplUnion], bool]] = None
    traverse_filter: Optional[Callable[[BaseCodeObjImplUnion], bool]] = None
    early_stop: Optional[Callable[[BaseCodeObjImplUnion], bool]] = None

    # What to build
    build_parent_map: bool = True
    build_children_map: bool = True
    build_id_paths: bool = True  # paths of IDs
    build_name_paths: bool = False  # paths of names (ancestor_paths)
    track_path_for: Optional[Callable[[BaseCodeObjImplUnion], bool]] = None

    # Collection
    collect_all_visited: bool = (
        False  # If True, collect all nodes visited, not just filtered
    )


@dataclass
class HierarchyTraversalResult:
    """Result of hierarchy traversal."""

    collected_ids: list[str] = field(default_factory=list)
    parent_map: dict[str, Optional[str]] = field(default_factory=dict)
    children_map: dict[str, list[str]] = field(default_factory=dict)
    id_path_map: dict[str, list[str]] = field(default_factory=dict)
    name_path_map: dict[str, list[str]] = field(default_factory=dict)
    all_visited_ids: set[str] = field(default_factory=set)
    early_stopped: bool = False


def traverse_hierarchy(
    codeObjs: dict[str, Core],
    codeObjImpls: dict[str, BaseCodeObjImplUnion],
    codeObjVariants: dict[str, Variant],
    codeObjVariantMap: dict[str, str],
    root_ids: list[str],
    options: Optional[TraversalOptions] = None,
) -> HierarchyTraversalResult:
    if options is None:
        options = TraversalOptions()

    result = HierarchyTraversalResult()

    def get_impl(id: str) -> BaseCodeObjImplUnion:
        variant_id = codeObjVariantMap[id]
        variant = codeObjVariants[variant_id]
        return get_effective_impl(codeObjImpls[variant.impl], codeObjs[id], variant)

    # Build stack with optional filtering
    stack: list[tuple[str, list[str], list[str]]] = []  # (id, id_path, name_path)
    for root_id in reversed(root_ids):
        if not options.traverse_filter or options.traverse_filter(get_impl(root_id)):
            stack.append((root_id, [], []))

    while stack:
        current_id, current_id_path, current_name_path = stack.pop()

        if not current_id or current_id in result.all_visited_ids:
            continue

        result.all_visited_ids.add(current_id)
        impl = get_impl(current_id)

        # Build paths
        new_id_path = current_id_path + [current_id]
        new_name_path = current_name_path
        if options.build_name_paths and current_id in codeObjs:
            new_name_path = current_name_path + [codeObjs[current_id].name]

        # Store path information
        if options.build_id_paths:
            if not options.track_path_for or options.track_path_for(impl):
                result.id_path_map[current_id] = new_id_path
            else:
                result.id_path_map[current_id] = list(current_id_path)

        if options.build_name_paths:
            result.name_path_map[current_id] = new_name_path

        # Collect if matches filter
        if options.collect_all_visited or (
            not options.collect_filter or options.collect_filter(impl)
        ):
            result.collected_ids.append(current_id)

        # Process children
        if isinstance(impl, BaseParentCodeObjImpl):
            children = impl.children

            if options.build_children_map:
                result.children_map[current_id] = children

            if options.build_parent_map:
                for child_id in children:
                    result.parent_map[child_id] = current_id

            # Add children to stack if we should traverse them
            if not options.traverse_filter or options.traverse_filter(impl):
                for child_id in reversed(children):
                    child_impl = get_impl(child_id)
                    if not options.traverse_filter or options.traverse_filter(
                        child_impl
                    ):
                        # Determine paths for child
                        child_id_path = result.id_path_map.get(current_id, new_id_path)
                        stack.append((child_id, child_id_path, new_name_path))

        # Check early stop
        if options.early_stop and result.collected_ids:
            last_impl = get_impl(result.collected_ids[-1])
            if options.early_stop(last_impl):
                result.early_stopped = True
                break

    # Set root parents to None
    for root_id in root_ids:
        if root_id in result.all_visited_ids and options.build_parent_map:
            result.parent_map.setdefault(root_id, None)

    return result
