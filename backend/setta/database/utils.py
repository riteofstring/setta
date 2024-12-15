import copy
import uuid


def create_new_id():
    return str(uuid.uuid4())


def maybe_new_id(x):
    return x if x else create_new_id()


def aggregate_results(results, top_level_key, aggregate):
    output = {}
    for row in results:
        key = row[top_level_key]
        if key not in output:
            output[key] = {**row, **{a: [] for a in aggregate}}
        for a in aggregate:
            output[key][a].append(row[a])
    return output


def rename_keys(x, to_rename):
    output = copy.deepcopy(x)
    for old_key in to_rename.keys():
        new_key = to_rename[old_key]
        if old_key in output and new_key != old_key:
            output[new_key] = output[old_key]
            del output[old_key]
    return output


def create_id_map(old_ids):
    return dict((x, create_new_id()) for x in old_ids)


def remap_ids(x, old_ids=None):
    if old_ids is None:
        old_ids = list(x.keys())
    id_map = create_id_map(old_ids)
    new_obj = rename_keys(x, id_map)
    return new_obj, id_map


def uuid_str_to_blob(uuid_str) -> bytes | None:
    """Convert UUID string to 16-byte blob"""
    if uuid_str:
        return uuid.UUID(uuid_str).bytes
    return None

def blob_to_uuid_str(blob) -> str | None:
    """Convert 16-byte blob back to UUID string"""
    if blob:
        return str(uuid.UUID(bytes=blob))
    return None