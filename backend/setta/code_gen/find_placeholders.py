from setta.utils.constants import C


def double_braces(x):
    # return f"{{{{ {x} }}}}"
    return x


def needs_yaml(script):
    return double_braces("SETTA_YAML_FILE") in script


def needs_python_argparse(script):
    return double_braces("SETTA_PYTHON_ARGPARSE") in script


def needs_generated_python(script):
    return double_braces(C.SETTA_GENERATED_PYTHON) in script
