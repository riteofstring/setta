def push_var_deep(objects, target_var_name):
    def get_dependencies(obj):
        """Retrieve dependencies from either 'deps' or 'params' within 'value'."""
        if "deps" in obj:
            return obj["deps"]
        if "params" in obj["value"]:
            return obj["value"]["params"]
        return obj["value"]

    def find_dependents(obj_list, var_name):
        """Find all objects that directly or indirectly depend on the given object."""
        dependents = set()
        for obj in obj_list:
            if var_name in get_dependencies(obj):
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


def process_refs(value, refs, get_var_name, position=None):
    shift = 0
    refs = sorted(refs, key=lambda x: x["startPos"], reverse=True)
    for ref in refs:
        ref_section_id = ref["sectionId"]
        ref_param_info_id = ref["paramInfoId"]
        ref_is_args_obj = ref["isArgsObj"]
        ref_var_name = get_var_name(ref_section_id, ref_param_info_id, ref_is_args_obj)
        startPos = ref["startPos"]
        endPos = ref["endPos"]

        if position is not None:
            # Calculate current replacement's length difference
            length_diff = len(ref_var_name) - (endPos - startPos)

            # Update position if replacement occurs before the initial position
            if endPos <= position:
                # All changes before the position affect its offset
                shift += length_diff
            elif startPos < position < endPos:
                position = startPos + len(
                    ref_var_name
                )  # Reset position to after the new substring

        value = value[:startPos] + ref_var_name + value[endPos:]

    if position is not None:
        return value, position + shift
    return value
