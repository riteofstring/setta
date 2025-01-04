from setta.utils.constants import C


def tp(x):
    return f"{C.TEMPLATE_PREFIX}{x}"


def needs_yaml(script):
    return tp("SETTA_YAML_FILE") in script
