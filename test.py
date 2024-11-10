from setta.code_gen.python.infer_imports import infer_imports

x="""import numpy as np

def calculate():
    return np.sum([1, 2, 3])

calculate()"""

print(infer_imports(x))
