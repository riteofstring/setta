import re


for match in re.finditer(re.escape("$hello"), "how are you $hello"):
    print(match.start())