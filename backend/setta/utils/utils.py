import json
import os
from collections import defaultdict
from json import JSONDecodeError
from pathlib import Path


def get_absolute_path(src_path, file_path):
    return (Path(src_path).parent / file_path).resolve()


def is_dev_mode():
    return os.environ.get("SETTA_DEV_MODE")


def try_json(x):
    try:
        return json.loads(x)
    except (JSONDecodeError, TypeError):
        return x


def filter_dict(x, keep_keys=None, default_vals=None):
    if not isinstance(x, dict):
        return x

    return {
        k: filter_dict(v, None, default_vals.get(k) if default_vals else None)
        for k, v in x.items()
        if (keep_keys is None or k in keep_keys)
        and (
            (default_vals is None) or (k not in default_vals) or (v != default_vals[k])
        )
    }


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


def save_json_to_file(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def prune_dict(id_to_children: dict, keep_ids: list) -> dict:
    """
    Prunes a dictionary to keep only specified IDs and their descendants.

    Args:
        id_to_children: Dictionary mapping IDs to lists of child IDs
        keep_ids: List of IDs to keep along with their descendants

    Returns:
        New dictionary containing only the specified IDs and their descendants
    """
    # First find all descendants of the keep_ids
    to_keep = set()

    def collect_descendants(current_id):
        if current_id not in to_keep:  # Avoid cycles
            to_keep.add(current_id)
            for child_id in id_to_children.get(current_id, []):
                collect_descendants(child_id)

    # Collect all descendants
    for id in keep_ids:
        collect_descendants(id)

    # Create new dict with only the ids we want to keep
    return {id: children for id, children in id_to_children.items() if id in to_keep}


def remove_empty(x):
    if isinstance(x, defaultdict):
        # Create a new defaultdict with the same default_factory
        result = defaultdict(x.default_factory)
        # Add only non-empty items
        for k, v in x.items():
            if len(v) > 0:
                result[k] = v
        return result
    else:
        # Original behavior for regular dictionaries
        return {k: v for k, v in x.items() if len(v) > 0}
