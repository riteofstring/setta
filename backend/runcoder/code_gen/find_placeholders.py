def double_braces(x):
    return f"{{{{ {x} }}}}"


def needs_yaml(script):
    return double_braces("RUNCODER_YAML_FILE") in script


def needs_python_argparse(script):
    return double_braces("RUNCODER_PYTHON_ARGPARSE") in script


def needs_generated_python(script):
    return double_braces("RUNCODER_GENERATED_CODE") in script
