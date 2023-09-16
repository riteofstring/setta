import subprocess
import re
import json
from pprint import pprint
from src.runcoder.cli.mypy_parsing import parse_all_errors

result = subprocess.run(['mypy', "simple.py", '--show-error-end', '--no-error-summary', '--no-pretty', '--no-color-output'], capture_output=True, text=True)

with open('data.json', 'w') as f:
    json.dump(parse_all_errors(result.stdout), f, indent=4)