import re


def parse_all_errors(msg):
    pattern = r"^(?P<location>(?P<file>[^\n]+?):(?P<line>\d+):(?P<column>\d+):(?P<endLine>\d+):(?P<endColumn>\d+)): (?P<type>\w+): (?P<message>.*?)(?:  \[(?P<code>[\w-]+)\])?$"
    result = msg.split("\n")
    output = []

    for r in result:
        match = re.match(pattern, r)
        if match:
            all_groups = match.groupdict()
            output.append(all_groups)

    return [parse_individual_error(x) for x in output]


def parse_individual_error(info):
    if info["code"] == "arg-type":
        info["code"] = "argType"
        return info
    if info["code"] == "call-arg":
        x_vars, error_type = parse_call_arg_error(info["message"])
        info["code"] = error_type
        info["badVars"] = x_vars
        return info
    return info


def parse_call_arg_error(msg):
    error_type = ""
    x_vars = []

    if "Missing positional argument" in msg:
        error_type = "missingArgs"
        x_vars_match = re.search(r'Missing positional argument[s]? "(.+?)" in', msg)

        if x_vars_match:
            x_vars = x_vars_match.group(1).split('", "')

    elif "Unexpected keyword argument" in msg:
        error_type = "unexpectedKeywordArg"
        x_var_match = re.search(r'Unexpected keyword argument "(.+?)"', msg)

        if x_var_match:
            x_vars = [x_var_match.group(1)]

    return x_vars, error_type
