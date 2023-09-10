import jedi
import parso
from pprint import pprint

code = "import torch.nn; torch.nn.CrossEntropyLoss("

results = jedi.Script(code).get_signatures(line=1, column=len(code))[0].params
output = []
for x in results:
    curr = {"name": x.name}
    child = parso.parse(x.to_string()).children[0]
    while "defaultVal" not in curr:
        if (isinstance(child, parso.python.tree.ExprStmt)):
            child = child.get_rhs()
        elif (isinstance(child, (parso.python.tree.Keyword, parso.python.tree.String))):
            curr["defaultVal"] = child.value
        elif (isinstance(child, parso.python.tree.PythonNode)):
            # print(child.children[1].value)
            curr["defaultVal"] = child.children[1].value
        else:
            curr["defaultVal"] = None
    output.append(curr)

pprint(output)