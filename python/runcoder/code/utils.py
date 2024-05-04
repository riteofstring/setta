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
