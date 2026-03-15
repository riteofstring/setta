import json
from json import JSONDecodeError
from pathlib import Path

from setta.code_gen.utils import sanitize_slug

GEN_CODE_FILENAME = "setta_gen.py"
GEN_CODE_META_FILENAME = "setta_gen_meta.py"


def build_project_sections_dir(code_root: Path, project_name: str) -> Path:
    project_slug = sanitize_slug(project_name)
    return code_root / "sections" / project_slug


def build_gen_code_path(code_root: Path, project_name: str) -> Path:
    return build_project_sections_dir(code_root, project_name) / GEN_CODE_FILENAME


def try_json(x):
    try:
        return json.loads(x)
    except (JSONDecodeError, TypeError):
        return x


def replace_at_positions(input_string, replacements, return_positions=False):
    """
    Replace substrings at specific positions in the input string.

    Args:
        input_string (str): The original string to modify
        replacements (list): List of tuples (position, old_value, new_value)
        return_positions (bool): Whether to return new positions of replacements

    Returns:
        Union[str, tuple[str, list[tuple[int, str]]]]:
            If return_positions is False: Modified string with all replacements applied
            If return_positions is True: Tuple of (modified string, list of (position, new_value))

    Raises:
        ValueError: If any replacement would result in an invalid operation
    """
    # Sort replacements by position in descending order to avoid position shifts
    replacements = sorted(replacements, reverse=True, key=lambda x: x[0])

    # Convert string to list for easier manipulation
    result = list(input_string)

    # Track new positions if requested
    new_positions = []

    for pos, old, new in replacements:
        # Verify the position is valid
        if pos < 0 or pos >= len(input_string):
            raise ValueError(f"Position {pos} is out of bounds")

        # Verify the old value matches at the specified position
        if not input_string.startswith(old, pos):
            raise ValueError(
                f"Expected '{old}' at position {pos}, but found '{input_string[pos : pos + len(old)]}'"
            )

        # Calculate the shift this replacement will cause
        current_shift = len(new) - len(old)

        # Replace the characters
        result[pos : pos + len(old)] = list(new)

        # If tracking new positions, add the current replacement's new position
        if return_positions:
            new_positions.append((pos, new))
            # Update all previous entries' positions to account for this shift
            for i in range(len(new_positions) - 1):
                pos_i, val_i = new_positions[i]
                new_positions[i] = (pos_i + current_shift, val_i)

    # Join the result list back into a string
    final_string = "".join(result)

    # Return based on whether return_positions is requested
    if return_positions:
        return final_string, new_positions
    return final_string
__all__ = [
    "GEN_CODE_FILENAME",
    "GEN_CODE_META_FILENAME",
    "build_gen_code_path",
    "build_project_sections_dir",
    "replace_at_positions",
    "try_json",
]
