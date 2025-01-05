from setta.code_gen.python.ast_utils import find_missing_imports

code ="""from torch import nn
nn.CrossEntropyLoss
x=5
y=z
"""

print(find_missing_imports(code))