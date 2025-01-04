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


def process_refs(
    code,
    refs,
    get_ref_var_name,
    cursor_position=None,
    templateVars=None,
    get_template_var_replacement_value=None,
    var_name_to_position_dict=None,
):
    positions = {
        "refs": [],  # list of tuples, where each tuple is (position, replacement_value)
        "templateVars": [],  # list of tuples, where each tuple is (position, replacement_value)
        "cursor": cursor_position,
    }
    keyword_to_replacement_value = {}
    if templateVars is None:
        templateVars = []
    if var_name_to_position_dict is None:
        var_name_to_position_dict = {}

    refs_set = set(id(x) for x in refs)
    to_process = sorted(refs + templateVars, key=lambda x: x["startPos"])
    args = [
        positions,
        keyword_to_replacement_value,
        to_process,
        refs_set,
        get_ref_var_name,
        get_template_var_replacement_value,
        var_name_to_position_dict,
    ]
    code = process_refs_helper(code, *args, process_last_ones=False)
    code = process_refs_helper(code, *args, process_last_ones=True)
    return code, positions, keyword_to_replacement_value


def process_refs_helper(
    code,
    positions,
    keyword_to_replacement_value,
    to_process,
    refs_set,
    get_ref_var_name,
    get_template_var_replacement_value,
    var_name_to_position_dict,
    process_last_ones,
):
    input_positions_len = {k: len(v) for k, v in positions.items() if k != "cursor"}

    for i, x in enumerate(to_process):
        if x.get("processLast", False) != process_last_ones:
            continue

        if id(x) in refs_set:
            replacement_value = get_ref_var_name(
                x["sectionId"], x["paramInfoId"], x["isArgsObj"]
            )
            type = "refs"
        else:
            replacement_value = get_template_var_replacement_value(code, x)
            type = "templateVars"

        startPos = x["startPos"]
        endPos = startPos + len(x["keyword"])
        length_diff = len(replacement_value) - (endPos - startPos)

        # Update positions for all future replacements
        for future_x in to_process[i + 1 :]:
            future_x["startPos"] += length_diff

        # Update positions for all positions that already existed when this function was called.
        update_existing_positions(positions, input_positions_len, startPos, length_diff)

        update_var_name_to_position_dict(
            var_name_to_position_dict, startPos, length_diff
        )

        if positions["cursor"] is not None:
            positions["cursor"] = get_new_cursor_position(
                positions["cursor"], length_diff, startPos, endPos
            )

        positions[type].append((startPos, replacement_value))
        code = code[:startPos] + replacement_value + code[endPos:]
        keyword_to_replacement_value[x["keyword"]] = replacement_value

    return code


def update_existing_positions(positions, input_positions_len, startPos, length_diff):
    print("update_existing_positions", input_positions_len, flush=True)
    for k, v in input_positions_len.items():
        for i in range(v):
            if startPos < positions[k][i][0]:
                p = positions[k][i]
                positions[k][i] = (p[0] + length_diff, p[1])


def update_var_name_to_position_dict(var_name_to_position_dict, startPos, length_diff):
    for var_name_to_position in var_name_to_position_dict.values():
        for var_name, (position, var_str) in var_name_to_position.items():
            if startPos < position:
                var_name_to_position[var_name] = (position + length_diff, var_str)


def get_new_cursor_position(cursor_position, length_diff, startPos, endPos):
    # Update position if replacement occurs before the initial position
    if endPos <= cursor_position:
        # All changes before the position affect its offset
        return cursor_position + length_diff
    elif startPos < cursor_position < endPos:
        return endPos + length_diff  # Reset position to after the new substring
    return cursor_position
