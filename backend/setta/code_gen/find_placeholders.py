from setta.utils.constants import C


def template_prefix(x):
    # return f"{{ {x} }}"
    return f"${x}"


def needs_yaml(script):
    return template_prefix("SETTA_YAML_FILE") in script


def needs_generated_python(script):
    return template_prefix(C.SETTA_GENERATED_PYTHON) in script
