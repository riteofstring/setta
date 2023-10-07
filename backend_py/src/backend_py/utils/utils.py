import random
from pathlib import Path
from uuid import uuid4


def create_new_id():
    return uuid4()


def maybe_new_id(x):
    return x if x else create_new_id()


def get_absolute_path(src_path, file_path):
    return (Path(src_path).parent / file_path).resolve()


def generate_memorable_string():
    adjectives = ["furry", "happy", "sad", "large", "tiny"]
    nouns = ["dog", "cat", "bird", "fish", "mouse"]
    states = ["utah", "texas", "california", "nevada", "florida"]

    random_string = (
        f"{random.choice(adjectives)}_{random.choice(nouns)}_{random.choice(states)}"
    )
    return random_string


def aggregate_join_results(results, top_level_key, aggregate):
    output = {}
    for row in results:
        row = dict(row)
        key = row[top_level_key]
        if key not in output:
            output[key] = {**row, **{a: [] for a in aggregate}}
        for a in aggregate:
            output[key][a].append(row[a])
    return output
