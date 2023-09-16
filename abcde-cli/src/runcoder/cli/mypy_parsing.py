import re


def parse_all_errors(msg):
    # https://github.com/matangover/mypy-vscode/blob/master/src/mypy.ts
    pattern = r"^(?P<location>(?P<file>[^\n]+?):(?P<line>\d+):(?P<column>\d+):(?P<endLine>\d+):(?P<endColumn>\d+)): (?P<type>\w+): (?P<message>.*?)(?:  \[(?P<code>[\w-]+)\])?$"
    result = re.split(r"\r?\n", msg)

    output = []
    for r in result:
        print(r)
        match = re.search(pattern, r)
        if match:
            # Extract all named groups as a dictionary
            all_groups = match.groupdict()
            output.append(all_groups)

    return [parse_individual_error(x) for x in output]


def parse_individual_error(info):
    if info["code"] == "arg-type":
        return info
    if info["code"] == "call-arg":
        info["missing"] = parse_call_arg_error(info["message"])
        return info


def parse_call_arg_error(msg):
    x_vars = re.search(r'Missing positional argument[s]? "(.+?)" in', msg)
    # y_var = re.search(r'in call to "(.+?)"', msg)

    if x_vars:
        x_vars = x_vars.group(1).split('", "')

    # if y_var:
    # y_var = y_var.group(1)

    return x_vars
