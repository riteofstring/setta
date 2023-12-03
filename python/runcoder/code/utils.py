def push_var_deep(objects, target_name):
    # Find the index of the target object
    target_index = next(
        (i for i, obj in enumerate(objects) if obj["var_name"] == target_name), None
    )
    if target_index is None:
        return objects  # Target not found, return the list unchanged

    # Check the dependencies of objects after the target to see how far we can move it
    # We can move the target down as long as no object depends on it
    move_to_index = target_index
    for i in range(target_index + 1, len(objects)):
        curr = objects[i]
        if ("deps" in curr and target_name in curr["deps"]) or (
            isinstance(curr["value"], dict) and target_name in curr["value"]["params"]
        ):
            break
        move_to_index = i

    # If the target can be moved down in the list, perform the rearrangement
    if move_to_index != target_index:
        # Remove the target object and insert it at the new position
        objects.insert(move_to_index, objects.pop(target_index))

    return objects
