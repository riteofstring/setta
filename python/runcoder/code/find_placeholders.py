def double_braces(x):
    return f"{{{{ {x} }}}}"


def needs_code(script):
    return double_braces("RUNCODER_PYTHON_FILE") in script


def needs_yaml(script):
    return double_braces("RUNCODER_YAML_FILE") in script
