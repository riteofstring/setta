import subprocess
import re
import json
from pprint import pprint

result = subprocess.run(['mypy', "simple.py", '--show-error-end', '--no-error-summary', '--no-pretty', '--no-color-output'], capture_output=True, text=True)
print(result.stdout)

# with open('data.json', 'w') as f:
#     json.dump(result.stdout, f, indent=4)