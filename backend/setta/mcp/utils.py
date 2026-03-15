import dataclasses
from typing import Callable, TypeVar

from pydantic import BaseModel

from setta.types.id import (
    ID,
    CanonicalToTemporaryIDMap,
    TemporaryToCanonicalIDMap,
)


class IDDoesNotExist(Exception):
    pass


T = TypeVar("T")


def traverse_and_replace(data: T, replace_func: Callable[[object], object]) -> T:
    """
    Recursively traverse data structure and apply replace_func to all string values.

    Args:
        data: The data structure to traverse (can be simple type, dict, or list)
        replace_func: Function that takes a value and returns a replacement value

    Returns:
        The transformed data structure
    """
    if isinstance(data, BaseModel):
        clone = data.model_copy(deep=True)
        model_fields = type(clone).model_fields
        for field_name in model_fields.keys():
            value = getattr(clone, field_name)
            setattr(
                clone,
                field_name,
                traverse_and_replace(value, replace_func),
            )
        return clone
    if dataclasses.is_dataclass(data) and not isinstance(data, type):
        changes = {}
        for field in dataclasses.fields(data):
            if not field.init:
                continue
            value = getattr(data, field.name)
            changes[field.name] = traverse_and_replace(value, replace_func)
        return dataclasses.replace(data, **changes)
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
    data: T,
    canonical_to_temporary: CanonicalToTemporaryIDMap,
    temporary_to_canonical: TemporaryToCanonicalIDMap,
) -> T:
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
    data: T, temporary_to_canonical: TemporaryToCanonicalIDMap
) -> T:
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


def convert_existing_canonical_ids_to_temporary(
    data: T,
    canonical_to_temporary: CanonicalToTemporaryIDMap,
) -> T:
    """Replace only the canonical IDs that already exist in the map."""

    def replace_existing(value):
        if isinstance(value, ID):
            return canonical_to_temporary.get(value, value)
        return value

    return traverse_and_replace(data, replace_existing)
