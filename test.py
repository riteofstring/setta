from setta.code_gen.python.infer_imports import find_missing_imports

# Example usage and tests
if __name__ == "__main__":
    # Test case 1: Simple module usage
    code1 = """x = numpy.array([1, 2, 3])
y = math.sqrt(2)"""
    print("Test 1:", find_missing_imports(code1))  # Should include 'numpy'
    
    # Test case 2: Nested module usage
    code2 = """model = torch.nn.Sequential(
    torch.nn.Linear(10, 10),
    torch.nn.ReLU()
)"""
    print("Test 2:", find_missing_imports(code2))  # Should include 'torch' and 'torch.nn'
    
    # Test case 3: Code with existing imports
    code3 = """import torch
from math import sqrt

x = torch.tensor([1, 2, 3])
y = torch.nn.Linear(10, 10)
z = sqrt(2)"""
    print("Test 3:", find_missing_imports(code3))  # Should include only 'torch.nn'
    
    # Test case 4: Invalid code
    try:
        code4 = "x = [1,2,3"
        print("Test 4:", find_missing_imports(code4))
    except ValueError as e:
        print("Test 4 (invalid code):", e)
        
    # Test case 5: Local variables and functions
    code5 = """def fn(value):
    print(value)

x = [1,2,3]
y = fn(x)"""
    print("Test 5:", find_missing_imports(code5))  # Should be empty set
    
    # Test case 6: Import aliases
    code6 = """import numpy as np
from torch.nn import Linear as LinLayer

x = np.array([1, 2, 3])
y = torch.tensor([4, 5, 6])
model = LinLayer(10, 20)"""
    print("Test 6:", find_missing_imports(code6))  # Should return {'torch'}