# from runcoder.code.export_selected import export_selected
# from runcoder.code.generate_code import generate_code
# import json
# from pprint import pprint

# with open("python/runcoder/backend/seedData/exampleProjects/diffusionDrops.json", 'r') as f:
#     x = json.load(f)


# x["project"] = {"id": x.pop('id'), "name": x.pop('name'),  "owner": x.pop('owner'), "defaultConfigId": x.pop("defaultConfigId")}
# x.update(x.pop("configs")[1])

# with open("python/runcoder/backend/seedData/BaseUITypes.json", 'r') as f:
#     baseu = json.load(f)

# x["uiTypes"].update(baseu)

# x = export_selected(x)

# sectionId = "f4e68c55-0f5d-4110-a8fe-bec49d5bc3b4"
# push_var_name = None
# for k,v in x.items():
#     if v["sectionId"] == sectionId:
#         push_var_name = k
#         break
# print(push_var_name)
# print(generate_code(x, push_var_name=push_var_name))


def push_id_deep(objects, target_id):
    def find_dependents(obj_list, obj_id):
        """Find all objects that directly or indirectly depend on the given object."""
        dependents = set()
        for obj in obj_list:
            if obj_id in obj["dependencies"]:
                dependents.add(obj["id"])
                dependents.update(find_dependents(obj_list, obj["id"]))
        return dependents

    # Find the index of the target object and its dependents
    target_index = None
    for i, obj in enumerate(objects):
        if obj["id"] == target_id:
            target_index = i
            break
    if target_index is None:
        return objects

    dependents = find_dependents(objects, target_id)

    # Determine the furthest position to which the target can be moved
    furthest_position = target_index
    for i in range(len(objects) - 1, target_index, -1):
        if not any(dep in objects[i]["dependencies"] for dep in dependents):
            furthest_position = i
            break

    # Reorder the list to move the target object and its dependents
    if furthest_position != target_index:
        # Extract the target and its dependents
        target_and_dependents = [
            obj for obj in objects if obj["id"] == target_id or obj["id"] in dependents
        ]

        # Remove the target and its dependents from the original list
        objects = [
            obj
            for obj in objects
            if obj["id"] != target_id and obj["id"] not in dependents
        ]

        # Insert the target and its dependents at the furthest position
        objects = (
            objects[: furthest_position - len(target_and_dependents) + 1]
            + target_and_dependents
            + objects[furthest_position - len(target_and_dependents) + 1 :]
        )

    return objects


# Example usage
the_list = [
    {"id": "A", "dependencies": []},
    {"id": "B", "dependencies": ["A"]},
    {"id": "W", "dependencies": []},
    {"id": "Z", "dependencies": ["A", "B"]},
    {"id": "D", "dependencies": ["Z"]},
    {"id": "X", "dependencies": ["A"]},
    {"id": "C", "dependencies": []},
]
new_list = push_id_deep(the_list, "A")
print(new_list)
