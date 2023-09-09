import subprocess
import re
import json

pattern = r'^(?P<location>(?P<file>[^\n]+?):(?P<line>\d+):(?P<column>\d+):(?P<endLine>\d+):(?P<endColumn>\d+)): (?P<type>\w+): (?P<message>.*?)(?:  \[(?P<code>[\w-]+)\])?$'

result = subprocess.run(['mypy', "simple.py", '--show-error-end', '--no-error-summary', '--no-pretty', '--no-color-output'], capture_output=True, text=True)
result = re.split(r'\r?\n', result.stdout)

output = []
for r in result:
    print(r)
    match = re.search(pattern, r)
    if (match):
        # Extract all named groups as a dictionary
        all_groups = match.groupdict()
        output.append(all_groups)

with open("typeCheck.json", 'w') as f:
    json.dump({"typeCheck": output}, f, indent=4)