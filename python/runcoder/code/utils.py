import copy


def push_var_deep(objects, target_var_name):
    def get_dependencies(obj):
        """Retrieve dependencies from either 'deps' or 'params' within 'value'."""
        if "deps" in obj:
            return obj["deps"]
        return obj["value"]["params"]

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


def get_var_name(codeJson, sectionId, paramInfoId=None):
    for k, v in codeJson.items():
        if v["sectionId"] == sectionId and v.get("paramInfoId", None) == paramInfoId:
            return k
    return None


def get_str_from_value(value, codeJson):
    output = []
    for v in value:
        if v["type"] == "raw":
            output.append(v["value"])
        else:
            output.append(get_var_name(codeJson, v["value"]))
    return "".join(output)


def get_value_from_completions(codeJson, results, original_value):
    output = []
    # from_frontend_excluding_last = from_frontend[:-1]
    # is_completing_raw = from_frontend[-1]["type"] == "raw"
    for r in results:
        if r.name in codeJson and r.type == "statement":
            x = {
                "type": "ref",
                "value": codeJson[r.name]["sectionId"],
            }
            ff_copy = copy.deepcopy(original_value)
            ff_copy[-1]["value"] = ff_copy[-1]["value"][
                : r.get_completion_prefix_length()
            ]
            new_entry = [*ff_copy, x]

        else:
            x = {
                "type": "raw",
                "value": r.complete,
            }
            x["value"] = f"{original_value[-1]['value']}{x['value']}"
            new_entry = [*original_value[:-1], x]

        output.append(new_entry)

    return output
