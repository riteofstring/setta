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
