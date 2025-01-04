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
):
    # positions is a list of tuples, where each tuple is (position, shift, replacement_value)
    positions = {
        "refs": [],
        "cursor": [] if cursor_position is None else [(cursor_position, 0, None)],
        "templateVars": [],
    }
    keyword_to_replacement_value = {}
    if templateVars is None:
        templateVars = []

    refs_set = set(id(x) for x in refs)
    to_process = sorted(refs + templateVars, key=lambda x: x["startPos"], reverse=True)
    for x in to_process:
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

        positions[type].append((startPos, 0, replacement_value))
        set_new_positions_and_shifts(positions, replacement_value, startPos, endPos)

        code = code[:startPos] + replacement_value + code[endPos:]
        keyword_to_replacement_value[x["keyword"]] = replacement_value

    for k, v in positions.items():
        positions[k] = [(p + s, r) for p, s, r in v]

    return code, positions, keyword_to_replacement_value


def set_new_positions_and_shifts(positions, replacement_value, startPos, endPos):
    # Calculate current replacement's length difference
    length_diff = len(replacement_value) - (endPos - startPos)

    for v in positions.values():
        for idx in range(len(v)):
            position, shift, value = v[idx]

            # Update position if replacement occurs before the initial position
            if endPos <= position:
                # All changes before the position affect its offset
                shift += length_diff
            elif startPos < position < endPos:
                position = startPos + len(
                    replacement_value
                )  # Reset position to after the new substring

            v[idx] = position, shift, value
