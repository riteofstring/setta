from dataclasses import dataclass, field
from typing import Callable, Optional

from setta.types.code_obj_impls import BaseChildlessCodeObjImpl, BaseParentCodeObjImpl
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import get_effective_impl
from setta.types.generated.unions import BaseCodeObjImplUnion
from setta.types.id import ID
from setta.utils.utils import try_json


@dataclass
class TraversalOptions:  # setta-convert-pydantic-to-js: skip
    # Filters
    collect_filter: Optional[Callable[[BaseCodeObjImplUnion], bool]] = None
    traverse_filter: Optional[Callable[[BaseCodeObjImplUnion], bool]] = None
    early_stop: Optional[Callable[[BaseCodeObjImplUnion], bool]] = None

    # What to build
    build_parent_map: bool = False
    build_children_map: bool = False
    build_id_to_id_path: bool = False  # paths of IDs
    build_id_to_name_path: bool = False  # paths of names (ancestor_paths)
    build_name_path_to_id: bool = False
    build_name_path_to_descendants: bool = False
    track_path_for: Optional[Callable[[BaseCodeObjImplUnion], bool]] = None
    build_nested_dict: bool = False
    name_path_prefix: tuple[str, ...] = field(default_factory=tuple)

    # Collection
    collect_all_visited: bool = (
        False  # If True, collect all nodes visited, not just filtered
    )


@dataclass
class HierarchyTraversalResult:  # setta-convert-pydantic-to-js: skip
    """Result of hierarchy traversal."""

    collected_ids: list[ID] = field(default_factory=list)
    parent_map: dict[ID, Optional[ID]] = field(default_factory=dict)
    children_map: dict[ID, list[ID]] = field(default_factory=dict)
    id_to_id_path: dict[ID, tuple[ID, ...]] = field(default_factory=dict)
    id_to_name_path: dict[ID, tuple[str, ...]] = field(default_factory=dict)
    name_path_to_id: dict[tuple[str, ...], ID] = field(default_factory=dict)
    name_path_to_descendant_ids: dict[tuple[str, ...], set[ID]] = field(
        default_factory=dict
    )
    all_visited_ids: set[ID] = field(default_factory=set)
    nested_dict: dict = field(default_factory=dict)
    early_stopped: bool = False


def traverse_hierarchy(
    codeObjs: dict[ID, Core],
    codeObjImpls: dict[ID, BaseCodeObjImplUnion],
    codeObjVariants: dict[ID, Variant],
    codeObjVariantMap: dict[ID, ID],
    top_level_ids: list[ID],
    root_id: Optional[ID] = None,
    options: Optional[TraversalOptions] = None,
) -> HierarchyTraversalResult:
    if options is None:
        options = TraversalOptions()

    result = HierarchyTraversalResult()

    def get_impl(id: ID) -> BaseCodeObjImplUnion:
        variant_id = codeObjVariantMap[id]
        variant = codeObjVariants[variant_id]
        return get_effective_impl(codeObjImpls[variant.impl], codeObjs[id], variant)

    # Build stack with optional filtering
    stack: list[
        tuple[ID, tuple[ID, ...], tuple[str, ...]]
    ] = []  # (id, id_path, name_path)

    if root_id:
        if not options.traverse_filter or options.traverse_filter(get_impl(root_id)):
            stack.append((root_id, (), options.name_path_prefix))
    else:
        for top_level_id in top_level_ids:
            if not options.traverse_filter or options.traverse_filter(
                get_impl(top_level_id)
            ):
                stack.append((top_level_id, (), options.name_path_prefix))

    stack.reverse()

    while stack:
        current_id, current_id_path, current_name_path = stack.pop()

        if not current_id or current_id in result.all_visited_ids:
            continue

        result.all_visited_ids.add(current_id)
        impl = get_impl(current_id)

        # Build paths
        new_id_path = current_id_path + (current_id,)
        new_name_path = current_name_path
        if options.build_id_to_name_path and current_id in codeObjs:
            # Skip adding name for root_id to keep its path empty
            if current_id != root_id:
                new_name_path = current_name_path + (codeObjs[current_id].name,)

        if options.build_nested_dict:
            # Extract value using provided extractor
            if isinstance(impl, BaseChildlessCodeObjImpl):
                value = try_json(impl.value)
            elif isinstance(impl, BaseParentCodeObjImpl):
                value = {}
            else:
                raise TypeError(
                    f"Unexpected code object implementation type: {type(impl)}"
                )

            if new_name_path:  # Only process if we have a path
                # Navigate/create nested structure
                current_dict = result.nested_dict
                for key in new_name_path[:-1]:
                    if key not in current_dict:
                        current_dict[key] = {}
                    current_dict = current_dict[key]

                # Set the value at the final key
                current_dict[new_name_path[-1]] = value

        # Store path information
        if options.build_id_to_id_path:
            if not options.track_path_for or options.track_path_for(impl):
                result.id_to_id_path[current_id] = new_id_path
            else:
                result.id_to_id_path[current_id] = current_id_path

        if options.build_id_to_name_path:
            result.id_to_name_path[current_id] = new_name_path

        if options.build_name_path_to_id:
            result.name_path_to_id[new_name_path] = current_id

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
                        child_id_path = result.id_to_id_path.get(
                            current_id, new_id_path
                        )
                        stack.append((child_id, child_id_path, new_name_path))

        # Check early stop
        if options.early_stop and result.collected_ids:
            last_impl = get_impl(result.collected_ids[-1])
            if options.early_stop(last_impl):
                result.early_stopped = True
                break

    if options.build_parent_map:
        if root_id and root_id in result.all_visited_ids:
            result.parent_map.setdefault(root_id, None)
        for top_level_id in top_level_ids:
            if top_level_id in result.all_visited_ids:
                result.parent_map.setdefault(top_level_id, None)

    # Build name_path_to_descendant_ids if requested
    if options.build_name_path_to_descendants and options.build_id_to_name_path:
        for visited_id in result.all_visited_ids:
            if visited_id in result.id_to_name_path:
                name_path = result.id_to_name_path[visited_id]

                for i in range(0, len(name_path)):
                    ancestor_path = name_path[:i]
                    if ancestor_path not in result.name_path_to_descendant_ids:
                        result.name_path_to_descendant_ids[ancestor_path] = set()
                    result.name_path_to_descendant_ids[ancestor_path].add(visited_id)

    return result
