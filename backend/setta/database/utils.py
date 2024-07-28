import copy
import random
from collections import defaultdict
from uuid import uuid4


def create_new_id():
    return str(uuid4())


def maybe_new_id(x):
    return x if x else create_new_id()


def generate_memorable_string():
    adjectives = ["furry", "happy", "sad", "large", "tiny"]
    nouns = ["dog", "cat", "bird", "fish", "mouse"]
    states = ["utah", "texas", "california", "nevada", "florida"]

    random_string = (
        f"{random.choice(adjectives)}_{random.choice(nouns)}_{random.choice(states)}"
    )
    return random_string


def aggregate_results(results, top_level_key, aggregate):
    output = {}
    for row in results:
        row = dict(row)
        key = row[top_level_key]
        if key not in output:
            output[key] = {**row, **{a: [] for a in aggregate}}
        for a in aggregate:
            output[key][a].append(row[a])
    return output


def get_children_recursively(db, ids, query):
    all_ids = set(ids)
    parent_to_children = defaultdict(list, {c: [] for c in ids})
    for c in ids:
        db.execute(query, {"parentId": c})
        parent_child_pairs = db.fetchall()
        for row in parent_child_pairs:
            row = dict(row)
            childId = row["childId"]
            all_ids.add(childId)
            parent_to_children[row["parentId"]].append(childId)

    return list(all_ids), parent_to_children


def rename_keys(x, to_rename):
    output = copy.deepcopy(x)
    for old_key in to_rename.keys():
        new_key = to_rename[old_key]
        if old_key in output:
            output[new_key] = output[old_key]
            del output[old_key]
    return output


def create_id_map(old_ids):
    return dict((x, create_new_id()) for x in old_ids)


def remap_ids(x):
    old_ids = list(x.keys())
    id_map = create_id_map(old_ids)
    new_ids = rename_keys(x, id_map)
    return new_ids, id_map
