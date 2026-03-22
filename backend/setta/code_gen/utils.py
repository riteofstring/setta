import keyword
import re

GEN_CODE_INSTANCE_NAME = "state"
GEN_CODE_CLASS_NAME = "SettaState"

def sanitize_slug(name: str) -> str:
    # Replace brackets, quotes and other invalid chars with underscores.
    invalid_chars = "[]\"' "
    sanitized = "".join("_" if c in invalid_chars else c for c in name)
    while "__" in sanitized:
        sanitized = sanitized.replace("__", "_")
    return sanitized.strip("_").casefold()


_PYTHON_IDENTIFIER_INVALID_CHARS = re.compile(r"\W", flags=re.UNICODE)


def _is_python_keyword(name: str) -> bool:
    if name == "_":
        return False
    return keyword.iskeyword(name) or keyword.issoftkeyword(name)


def sanitize_python_identifier(name: str) -> str:
    sanitized = _PYTHON_IDENTIFIER_INVALID_CHARS.sub("_", name)
    if not sanitized:
        sanitized = "_"
    if sanitized[0].isdigit():
        sanitized = f"_{sanitized}"
    if _is_python_keyword(sanitized):
        sanitized = f"_{sanitized}"
    if not sanitized.isidentifier():
        sanitized = "".join(c if (c == "_" or c.isalnum()) else "_" for c in sanitized)
        if not sanitized:
            sanitized = "_"
        if sanitized[0].isdigit():
            sanitized = f"_{sanitized}"
        if _is_python_keyword(sanitized):
            sanitized = f"_{sanitized}"
    return sanitized


def create_unique_name(name, used_names):
    counter = 2
    while name in used_names:
        name = f"{name}_{counter}"
        counter += 1
    return name
