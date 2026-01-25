import keyword
import re

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


def sanitize_slug(name: str) -> str:
    return sanitize_name(name).casefold()


_PYTHON_IDENTIFIER_INVALID_CHARS = re.compile(r"\W", flags=re.UNICODE)


def sanitize_python_identifier(name: str) -> str:
    sanitized = _PYTHON_IDENTIFIER_INVALID_CHARS.sub("_", name)
    if not sanitized:
        sanitized = "_"
    if sanitized[0].isdigit():
        sanitized = f"_{sanitized}"
    if keyword.iskeyword(sanitized):
        sanitized = f"_{sanitized}"
    if not sanitized.isidentifier():
        sanitized = "".join(c if (c == "_" or c.isalnum()) else "_" for c in sanitized)
        if not sanitized:
            sanitized = "_"
        if sanitized[0].isdigit():
            sanitized = f"_{sanitized}"
        if keyword.iskeyword(sanitized):
            sanitized = f"_{sanitized}"
    return sanitized


def create_unique_name(name, used_names):
    counter = 2
    while name in used_names:
        name = f"{name}_{counter}"
        counter += 1
    return name
