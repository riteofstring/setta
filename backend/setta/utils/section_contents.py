from setta.utils.constants import C

# All this code is a conversion of frontend code to python
# TODO: Hopefully we can get rid of this duplication in the future!


def both_truthy_or_falsey(a, b):
    return (not a) == (not b) or a == b


def _find_all_descendants(
    all_code_info,
    code_info_children,
    code_info_ids,
    output_condition,
    stack_condition,
    param_path_condition=None,
):
    output = []
    id_stack = list(
        reversed([x for x in code_info_ids if stack_condition(all_code_info[x])])
    )
    visited = set()
    path_map = {} if param_path_condition else None

    if param_path_condition:
        for id in id_stack:
            path_map[id] = [id] if param_path_condition(all_code_info[id]) else []

    while id_stack:
        id = id_stack.pop()
        if not id or id in visited:
            continue

        visited.add(id)
        curr_info = all_code_info[id]

        if output_condition(curr_info):
            output.append(curr_info["id"])

        if stack_condition(curr_info):
            children = list(reversed(code_info_children[curr_info["id"]]))
            if param_path_condition:
                current_path = path_map[id]
                for child_id in children:
                    path_map[child_id] = (
                        [*current_path, child_id]
                        if param_path_condition(all_code_info[child_id])
                        else [*current_path]
                    )
            id_stack.extend(children)

    return {"ids": output, "pathMap": path_map}


def find_all_parameters_of_callables(
    all_code_info, code_info_children, code_info_ids, param_path_condition=None
):
    return _find_all_descendants(
        all_code_info,
        code_info_children,
        code_info_ids,
        lambda c: c.get("rcType") == C.PARAMETER,
        lambda c: c.get("rcType") == C.CALLABLE,
        param_path_condition,
    )


def find_all_parameters_of_not_callables(
    all_code_info, code_info_children, code_info_ids, param_path_condition=None
):
    return _find_all_descendants(
        all_code_info,
        code_info_children,
        code_info_ids,
        lambda c: c.get("rcType") == C.PARAMETER,
        lambda c: c.get("rcType") != C.CALLABLE,
        param_path_condition,
    )


def get_param_ids(
    c_state, code_info_children, selected_item, param_path_condition=None
):
    fn = (
        find_all_parameters_of_callables
        if selected_item
        else find_all_parameters_of_not_callables
    )

    code_info_ids = (
        [selected_item] if selected_item else code_info_children[selected_item]
    )

    return fn(c_state, code_info_children, code_info_ids or [], param_path_condition)


def get_param_ids_to_show_in_area(
    is_pinned, c_state, code_info_children, selected_item
):
    result = get_param_ids(
        c_state,
        code_info_children,
        selected_item,
        lambda p: p["rcType"] == C.PARAMETER,
    )
    ids = list(reversed(result["ids"]))
    path_map = result["pathMap"]

    top_level_param_ids = []
    top_level_param_ids_set = set()
    required_param_ids_to_paths = {}

    for a in ids:
        # Evaluates to true if:
        # 1. The current param's is_pinned matches the is_pinned condition
        # 2. And: either the param has no children or at least one of its children is required
        if both_truthy_or_falsey(c_state[a].get("isPinned"), is_pinned) and (
            len(code_info_children[a]) == 0
            or any(
                child in required_param_ids_to_paths for child in code_info_children[a]
            )
        ):
            for p in path_map[a]:
                required_param_ids_to_paths[p] = path_map[p]
                if path_map[a][0] not in top_level_param_ids_set:
                    top_level_param_ids.append(path_map[a][0])
                    top_level_param_ids_set.add(path_map[a][0])

    # Unreverse results
    top_level_param_ids.reverse()

    return {
        "requiredParamIdsToPaths": required_param_ids_to_paths,
        "topLevelParamIds": top_level_param_ids,
    }
