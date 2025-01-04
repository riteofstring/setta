from setta.utils.constants import C


def template_prefix(x):
    return f"{C.TEMPLATE_PREFIX}{x}"


def needs_yaml(script):
    return template_prefix("SETTA_YAML_FILE") in script
