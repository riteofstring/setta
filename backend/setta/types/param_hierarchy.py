from typing import Callable, TypedDict
from setta.types.code_obj_impls import BaseParentCodeObjImpl
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import get_effective_impl
from setta.types.generated.unions import BaseCodeObjImplUnion
from setta.types.project_state import ShownParamIdDetails
from setta.types.section_impls import BaseSectionWithParamsImpl


class ConditionFns(TypedDict):
    output: Callable[[BaseCodeObjImplUnion], bool] | None
    stack: Callable[[BaseCodeObjImplUnion], bool] | None
    param_path: Callable[[BaseCodeObjImplUnion], bool] | None
    early_return: Callable[[BaseCodeObjImplUnion], bool] | None


class AllDescendants(TypedDict):
    ids: list[str]
    path_map: dict[str, list[str]]
    children_map: dict[str, list[str]]
    early_return_triggered: bool


def get_effective_code_obj_impl_from_variant_map(
    id: str,
    impls: dict[str, BaseCodeObjImplUnion],
    cores: dict[str, Core],
    variants: dict[str, Variant],
    variant_map: dict[str, str],
):
    variant_id = variant_map[id]
    variant = variants[variant_id]
    return get_effective_impl(impls[variant.impl], cores[id], variant)


def find_all_descendants(
    impls: dict[str, BaseCodeObjImplUnion],
    cores: dict[str, Core],
    variants: dict[str, Variant],
    variant_map: dict[str, str],
    ids: list[str],
    conditions: ConditionFns,
):
    output: list[str] = []
    visited: set[str] = set()
    path_map: dict[str, list[str]] = {}
    children_map: dict[str, list[str]] = {}

    if conditions["stack"]:
        id_stack: list[str] = []
        for id in reversed(ids):
            impl = get_effective_code_obj_impl_from_variant_map(
                id, impls, cores, variants, variant_map
            )
            if conditions["stack"](impl):
                id_stack.append(id)
    else:
        id_stack = list(reversed(ids))

    if conditions["param_path"]:
        for id in id_stack:
            if conditions["param_path"](
                get_effective_code_obj_impl_from_variant_map(
                    id, impls, cores, variants, variant_map
                )
            ):
                path_map[id] = [id]
            else:
                path_map[id] = []

    while len(id_stack) > 0:
        id = id_stack.pop()
        if not id or id in visited:
            continue

        visited.add(id)
        impl = get_effective_code_obj_impl_from_variant_map(
            id, impls, cores, variants, variant_map
        )

        if conditions["output"] and conditions["output"](impl):
            output.append(id)

        if (not conditions["stack"] or conditions["stack"](impl)) and isinstance(
            impl, BaseParentCodeObjImpl
        ):
            children = impl.children
            children_map[id] = children
            children = list(reversed(children[:]))

            if conditions["param_path"]:
                current_path = path_map.get(id, [])
                for child_id in children:
                    child_impl = get_effective_code_obj_impl_from_variant_map(
                        child_id, impls, cores, variants, variant_map
                    )
                    if conditions["param_path"](child_impl):
                        path_map[child_id] = current_path + [child_id]
                    else:
                        path_map[child_id] = list(current_path)

            id_stack.extend(children)

        if len(output) > 0:
            last_id = output[-1]
            if (
                last_id
                and conditions["early_return"]
                and conditions["early_return"](
                    get_effective_code_obj_impl_from_variant_map(
                        last_id, impls, cores, variants, variant_map
                    )
                )
            ):
                return AllDescendants(
                    ids=output,
                    path_map=path_map,
                    children_map=children_map,
                    early_return_triggered=True,
                )

    return AllDescendants(
        ids=output,
        path_map=path_map,
        children_map=children_map,
        early_return_triggered=False,
    )


def get_param_ids_to_show_in_area(p, impl, is_pinned):
    if not isinstance(impl, BaseSectionWithParamsImpl):
        raise TypeError

    result = find_all_parameters_of_section(
        p,
        impl,
        {
            "output": is_base_param_code_obj_impl,
            "param_path": is_base_param_code_obj_impl,
        },
    )

    ids = result["ids"]
    path_map = result["path_map"]
    children_map = result["children_map"]

    ids.reverse()

    top_level_param_ids = []
    top_level_param_ids_set = set()
    required_param_ids_to_paths = {}

    for a in ids:
        # Evaluates to true if:
        # 1. The current param's is_pinned matches the is_pinned condition
        # 2. And: either the param has no children or at least one of its children is required
        # This logic is why it's REQUIRED for ids to be reversed (processed starting with children up to ancestors)
        if (a in impl.pinned_params) == is_pinned and (
            a not in children_map
            or len(children_map[a]) == 0
            or any(child in required_param_ids_to_paths for child in children_map[a])
        ):
            curr_path_map = path_map.get(a)
            if curr_path_map is None:
                raise Exception()

            for p in curr_path_map:
                required_param_ids_to_paths[p] = path_map.get(p, [])
                if curr_path_map and curr_path_map[0] not in top_level_param_ids_set:
                    top_level_param_ids.append(curr_path_map[0])
                    top_level_param_ids_set.add(curr_path_map[0])

    # unreverse results
    top_level_param_ids.reverse()

    return ShownParamIdDetails(
        requiredParamIdsToPaths=required_param_ids_to_paths,
        topLevelParamIds=top_level_param_ids,
    )
