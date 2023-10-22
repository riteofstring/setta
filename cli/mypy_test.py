import subprocess
import re
import json
from pprint import pprint
from src.runcoder.cli.mypy_parsing import parse_all_errors

result = subprocess.run(['mypy', "simple.py", '--show-error-end', '--no-error-summary', '--no-pretty', '--no-color-output'], capture_output=True, text=True)
print(result.stdout)

# with open('data.json', 'w') as f:
#     json.dump(result.stdout, f, indent=4)

pprint(parse_all_errors('tmpwa6noysj\tmpm3la8v98.py:5:37:5:38: error: Argument "weight" to "CrossEntropyLoss" has incompatible type "list[int]"; expected "Tensor | None"  [arg-type]'))