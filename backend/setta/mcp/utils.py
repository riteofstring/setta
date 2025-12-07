from setta.types.id import (
    ID,
    CanonicalToTemporaryIDMap,
    TemporaryToCanonicalIDMap,
)


class IDDoesNotExist(Exception):
    pass


def traverse_and_replace(data, replace_func):
    """
    Recursively traverse data structure and apply replace_func to all string values.

    Args:
        data: The data structure to traverse (can be simple type, dict, or list)
        replace_func: Function that takes a value and returns a replacement value

    Returns:
        The transformed data structure
    """
    if isinstance(data, dict):
        return {
            traverse_and_replace(k, replace_func): traverse_and_replace(v, replace_func)
            for k, v in data.items()
        }
    elif isinstance(data, list):
        return [traverse_and_replace(item, replace_func) for item in data]
    elif isinstance(data, str):
        return replace_func(data)
    else:
        return data


def convert_canonical_ids_to_temporary(
    data,
    canonical_to_temporary: CanonicalToTemporaryIDMap,
    temporary_to_canonical: TemporaryToCanonicalIDMap,
):
    """Replace canonical IDs with their temporary counterparts for LLM payloads."""

    def replace_canonical(value):
        if not isinstance(value, ID):
            return value

        if value in canonical_to_temporary:
            return canonical_to_temporary[value]

        new_id = 0
        for existing_id in temporary_to_canonical.keys():
            new_id = max(new_id, int(existing_id))
        new_temp_id = ID(str(new_id + 1))

        canonical_to_temporary[value] = new_temp_id
        temporary_to_canonical[new_temp_id] = value

        return new_temp_id

    return traverse_and_replace(data, replace_canonical)


def convert_temporary_ids_to_canonical(
    data, temporary_to_canonical: TemporaryToCanonicalIDMap
):
    """Swap temporary IDs back to canonical IDs when processing LLM output."""

    def replace_temporary(value):
        if isinstance(value, ID):
            if value in temporary_to_canonical:
                return temporary_to_canonical[value]
            raise IDDoesNotExist(
                f"{value} is not a valid id. The available ids are {str(temporary_to_canonical.keys())}"
            )

        return value

    return traverse_and_replace(data, replace_temporary)
