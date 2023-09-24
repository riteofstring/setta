import json
from src.runcoder.cli.generateCode import generate_code

with open("simple.json", 'r') as f:
    x = json.load(f)

print(generate_code(x))

# import ast
# import builtins
# from collections import defaultdict

# def get_location_str(node):
#     return f"{node.lineno}_{node.col_offset}"

# def infer_imports(code_str):
#     tree = ast.parse(code_str)
#     assigned_vars = set()
#     imports = defaultdict(list)
    
#     for node in ast.walk(tree):
#         if isinstance(node, ast.Assign):
#             for target in node.targets:
#                 if isinstance(target, ast.Name):
#                     assigned_vars.add(target.id)
        
#         elif isinstance(node, ast.Name) and node.id not in assigned_vars and node.id not in dir(builtins):
#             imports[get_location_str(node)].append(node.id) 
        
#         elif isinstance(node, ast.Attribute):
#             names = []
#             current_node = node
#             while isinstance(current_node, ast.Attribute):
#                 names.append(current_node.attr)
#                 current_node = current_node.value
            
#             if isinstance(current_node, ast.Name) and current_node.id not in assigned_vars and current_node.id not in dir(builtins):
#                 names.append(current_node.id)
#                 names.reverse()
#                 imports[get_location_str(node)].append('.'.join(names))
    
#     final_imports = set()
#     for candidates in imports.values():
#         if len(candidates) == 1:
#             final_imports.add(candidates[0])
#         else:
#             final_imports.add(candidates[1])

#     return final_imports

# print(infer_imports("torch.nn.CrossEntropyLoss"))
# print(infer_imports("x = max(3,5)\ny = torch.tensor([1,2,3])\nz = torch.nn.CrossEntropyLoss()\nw = numpy"))
# print(infer_imports("x = torch.nn.CrossEntropyLoss()"))
# print(infer_imports("x = torch.tensor([1,2,3])"))
# print(infer_imports("x = torch.nn.CrossEntropyLoss(torch.tensor([1,2,3]))"))