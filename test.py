# import ast
# import builtins
# from typing import Set, List

# def find_missing_imports(code: str) -> Set[str]:
#     """
#     Analyzes Python code and returns a set of missing imports.
    
#     Args:
#         code (str): String containing Python code to analyze
    
#     Returns:
#         Set[str]: Set of import statements that are missing
    
#     Example:
#         >>> code = "x = torch.nn.CrossEntropyLoss()"
#         >>> find_missing_imports(code)
#         {'torch', 'torch.nn'}
#     """
#     # Get set of built-in names
#     builtin_names = set(dir(builtins))
    
#     # Track existing imports and names
#     existing_imports = set()
#     missing_imports = set()
    
#     # Parse the code into an AST
#     try:
#         tree = ast.parse(code)
#     except SyntaxError as e:
#         raise ValueError(f"Invalid Python code: {str(e)}")
    
#     # First pass: collect existing imports
#     for node in ast.walk(tree):
#         if isinstance(node, ast.Import):
#             for name in node.names:
#                 existing_imports.add(name.name)
#         elif isinstance(node, ast.ImportFrom):
#             if node.module:
#                 existing_imports.add(node.module)
#                 for name in node.names:
#                     existing_imports.add(f"{node.module}.{name.name}")
    
#     # Second pass: find potential missing imports
#     for node in ast.walk(tree):
#         if isinstance(node, ast.Name):
#             # Skip if it's a built-in or already imported
#             if (node.id not in builtin_names and 
#                 node.id not in existing_imports and 
#                 isinstance(node.ctx, ast.Load)):
#                 missing_imports.add(node.id)
#         elif isinstance(node, ast.Attribute):
#             # Build the full attribute chain
#             attr_chain = []
#             current = node
#             while isinstance(current, ast.Attribute):
#                 attr_chain.append(current.attr)
#                 current = current.value
#             if isinstance(current, ast.Name):
#                 attr_chain.append(current.id)
            
#             # Reverse to get correct order (e.g., ['torch', 'nn', 'CrossEntropyLoss'])
#             attr_chain.reverse()
            
#             # Generate all possible import paths
#             for i in range(1, len(attr_chain)):
#                 import_path = '.'.join(attr_chain[:i])
#                 if (import_path not in existing_imports and 
#                     import_path not in builtin_names):
#                     missing_imports.add(import_path)
    
#     return missing_imports

# # Example usage and tests
# if __name__ == "__main__":
#     # Test case 1: Simple module usage
#     code1 = """x = numpy.array([1, 2, 3])
# y = math.sqrt(2)"""
#     print("Test 1:", find_missing_imports(code1))  # Should include 'numpy'
    
#     # Test case 2: Nested module usage
#     code2 = """model = torch.nn.Sequential(
#     torch.nn.Linear(10, 10),
#     torch.nn.ReLU()
# )"""
#     print("Test 2:", find_missing_imports(code2))  # Should include 'torch' and 'torch.nn'
    
#     # Test case 3: Code with existing imports
#     code3 = """import torch
# from math import sqrt

# x = torch.tensor([1, 2, 3])
# y = torch.nn.Linear(10, 10)
# z = sqrt(2)"""
#     print("Test 3:", find_missing_imports(code3))  # Should include 'torch.nn'
    
#     # Test case 4: Invalid code
#     try:
#         code4 = "x = [1,2,3"
#         print("Test 4:", find_missing_imports(code4))
#     except ValueError as e:
#         print("Test 4 (invalid code):", e)