def push_var_deep(objects, target_var_name):
    def find_dependents(obj_list, var_name):
        """Find all objects that directly or indirectly depend on the given object."""
        dependents = set()
        for obj in obj_list:
            if var_name in obj["dependencies"]:
                dependents.add(obj["var_name"])
                dependents.update(find_dependents(obj_list, obj["var_name"]))
        return dependents

    dependents = find_dependents(objects, target_var_name)
    everything_else = []
    target_and_dependents = []
    for obj in objects:
        if obj["var_name"] != target_var_name and obj["var_name"] not in dependents:
            everything_else.append(obj)
        else:
            target_and_dependents.append(obj)

    return everything_else + target_and_dependents


def process_refs(value, refs, get_var_name, cursor_position=None):
    # positions is a list of tuples, where each tuple is (positions, shift, ref_var_name)
    positions = [] if cursor_position is None else [(cursor_position, 0, None)]
    refs = sorted(refs, key=lambda x: x["startPos"], reverse=True)
    used_ref_var_names = []
    for ref in refs:
        ref_section_id = ref["sectionId"]
        ref_param_info_id = ref["paramInfoId"]
        ref_is_args_obj = ref["isArgsObj"]
        ref_var_name = get_var_name(ref_section_id, ref_param_info_id, ref_is_args_obj)
        startPos = ref["startPos"]
        endPos = startPos + len(ref["keyword"])

        positions.append((startPos, 0, ref_var_name))
        set_new_positions_and_shifts(positions, ref_var_name, startPos, endPos)

        value = value[:startPos] + ref_var_name + value[endPos:]
        used_ref_var_names.append(ref_var_name)

    positions = [(p + s, r) for p, s, r in positions]
    return value, used_ref_var_names, positions


def set_new_positions_and_shifts(positions, ref_var_name, startPos, endPos):
    # Calculate current replacement's length difference
    length_diff = len(ref_var_name) - (endPos - startPos)

    for idx in range(len(positions)):
        position, shift, curr_ref_var_name = positions[idx]

        # Update position if replacement occurs before the initial position
        if endPos <= position:
            # All changes before the position affect its offset
            shift += length_diff
        elif startPos < position < endPos:
            position = startPos + len(
                ref_var_name
            )  # Reset position to after the new substring

        positions[idx] = position, shift, curr_ref_var_name
