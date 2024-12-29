import copy


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
    value,
    refs,
    get_ref_var_name,
    cursor_position=None,
    templateVars=None,
    get_template_var_name=None,
):
    # positions is a list of tuples, where each tuple is (position, shift, replacement_name)
    positions = {
        "refs": [],
        "cursor": [] if cursor_position is None else [(cursor_position, 0, None)],
        "templateVars": [],
    }
    if templateVars is None:
        templateVars = []

    refs_set = set(id(x) for x in refs)
    to_process = sorted(refs + templateVars, key=lambda x: x["startPos"], reverse=True)
    for x in to_process:
        if id(x) in refs_set:
            replacement_name = get_ref_var_name(
                x["sectionId"], x["paramInfoId"], x["isArgsObj"]
            )
            type = "refs"
        else:
            replacement_name = get_template_var_name(x["sectionId"], x["keyword"])
            type = "templateVars"

        print("replacement_name", replacement_name, flush=True)

        if replacement_name is None:
            continue

        startPos = x["startPos"]
        endPos = startPos + len(x["keyword"])

        positions[type].append((startPos, 0, replacement_name))
        set_new_positions_and_shifts(positions, replacement_name, startPos, endPos)

        value = value[:startPos] + replacement_name + value[endPos:]

    for k, v in positions.items():
        positions[k] = [(p + s, r) for p, s, r in v]

    return value, positions


def set_new_positions_and_shifts(positions, replacement_name, startPos, endPos):
    # Calculate current replacement's length difference
    length_diff = len(replacement_name) - (endPos - startPos)

    for v in positions.values():
        for idx in range(len(v)):
            position, shift, name = v[idx]

            # Update position if replacement occurs before the initial position
            if endPos <= position:
                # All changes before the position affect its offset
                shift += length_diff
            elif startPos < position < endPos:
                position = startPos + len(
                    replacement_name
                )  # Reset position to after the new substring

            v[idx] = position, shift, name
