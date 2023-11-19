# def push_id_deep(objects, target_var_name):
#     def get_dependencies(obj):
#         """Retrieve dependencies from either 'deps' or 'params' within 'values'."""
#         return obj.get('deps', []) + obj.get('values', {}).get('params', [])

#     def find_dependents(obj_list, var_name):
#         """Find all objects that directly or indirectly depend on the given object."""
#         dependents = set()
#         for obj in obj_list:
#             if var_name in get_dependencies(obj):
#                 dependents.add(obj['var_name'])
#                 dependents.update(find_dependents(obj_list, obj['var_name']))
#         return dependents

#     dependents = find_dependents(objects, target_var_name)
#     everything_else = []
#     target_and_dependents = []
#     for obj in objects:
#         if obj['var_name'] != target_var_name and obj['var_name'] not in dependents:
#             everything_else.append(obj)
#         else:
#             target_and_dependents.append(obj)

#     return everything_else + target_and_dependents

# # Example usage
# the_list = [
#     {"var_name": "A", "deps": []},
#     {"var_name": "B", "deps": ["A"]},
#     {"var_name": "W", "deps": []},
#     {"var_name": "Z", "deps": ["A", "B"]},
#     {"var_name": "D", "values": {"params": ["A"]}},
#     {"var_name": "X", "deps": ["A", "Z"]},
#     {"var_name": "C", "deps": ["W"]},
# ]
# new_list = push_id_deep(the_list, "A")

# from pprint import pprint
# pprint(new_list)


from runcoder.code.generate_code import infer_imports
from pprint import pprint

code = "p8=None"
pprint(infer_imports(code))