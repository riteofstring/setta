import copy
from typing import TypeVar
from uuid import uuid4

T = TypeVar("T")


def create_new_id():
    return str(uuid4())


def rename_keys(x: dict[str, T], to_rename: dict[str, str]):
    output = copy.deepcopy(x)
    for old_key in to_rename.keys():
        new_key = to_rename[old_key]
        if old_key in output and new_key != old_key:
            output[new_key] = output[old_key]
            del output[old_key]
    return output


def create_id_map(old_ids: list[str]):
    return dict((x, create_new_id()) for x in old_ids)


def remap_ids(x: dict[str, T], old_ids: list[str] | None = None):
    if old_ids is None:
        old_ids = list(x.keys())
    id_map = create_id_map(old_ids)
    new_obj = rename_keys(x, id_map)
    return new_obj, id_map
