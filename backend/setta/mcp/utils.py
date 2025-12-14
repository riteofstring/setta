from setta.types.ai import ID, IDToUUIDForLLM


class IDDoesNotExist(Exception):
    pass


class SettaMCPToolError(Exception):
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


def replace_uuids_with_ids(data, uuid_to_id, id_to_uuid: IDToUUIDForLLM):
    """
    Replace all UUIDs in data with their corresponding IDs.
    If a UUID doesn't have an ID, create a new one and update the mapping.

    Args:
        data: Input data (can be simple type, dict, or list)
        uuid_to_id: Dictionary mapping UUIDs to IDs
        id_to_uuid: Dictionary mapping IDs to UUIDs

    Returns:
        Tuple of (transformed data, updated uuid_to_id, updated id_to_uuid)
    """

    def replace_uuid(value):
        if not isinstance(value, ID):
            return value

        if value in uuid_to_id:
            return uuid_to_id[value]
        else:
            # Create a new ID by incrementing the highest existing ID
            new_id = 0
            for id in id_to_uuid.keys():
                new_id = max(new_id, int(id))
            new_id += 1
            new_id = str(new_id)

            # Update mappings
            uuid_to_id[value] = new_id
            id_to_uuid[ID(new_id)] = value

            return new_id

    return traverse_and_replace(data, replace_uuid)


def replace_ids_with_uuids(data, id_to_uuid: IDToUUIDForLLM):
    """
    Replace all IDs in data with their corresponding UUIDs.
    If an ID doesn't have a UUID, leave it unchanged.

    Args:
        data: Input data (can be simple type, dict, or list)
        id_to_uuid: Dictionary mapping IDs to UUIDs

    Returns:
        Transformed data
    """

    def replace_id(value):
        if isinstance(value, ID):
            if value in id_to_uuid:
                return id_to_uuid[value]
            else:
                raise IDDoesNotExist(
                    f"{value} is not a valid id. The available ids are {str(id_to_uuid.keys())}"
                )

        return value  # No mapping found or not an ID, leave unchanged

    return traverse_and_replace(data, replace_id)
