SELF_IDENTIFIER = "state"
GEN_CODE_INSTANCE_NAME = "state"
GEN_CODE_CLASS_NAME = "SettaState"
CLASS_DEF = f"""
class {GEN_CODE_CLASS_NAME}:
    def __init__({SELF_IDENTIFIER}):
""".lstrip()


def sanitize_name(name):
    # Replace brackets, quotes and other invalid chars with underscores
    invalid_chars = "[]\"' "
    name = "".join("_" if c in invalid_chars else c for c in name)

    # Remove consecutive underscores
    while "__" in name:
        name = name.replace("__", "_")

    # Remove leading/trailing underscores
    name = name.strip("_")

    return name


def create_unique_name(name, used_names):
    counter = 2
    while name in used_names:
        name = f"{name}_{counter}"
        counter += 1
    return name
